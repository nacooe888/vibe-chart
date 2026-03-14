// Vercel serverless function for ephemeris calculations
// Uses Moshier ephemeris (pure JS) to compute exact transit-to-natal aspect dates
// Accepts a batch of transits and returns real dates for all of them

import { getAllPlanets } from 'ephemeris'

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
  maxDuration: 30,
}

const DAY = 86400000
const HOUR = 3600000

const PLANET_MAP = {
  Sun: 'sun', Moon: 'moon', Mercury: 'mercury', Venus: 'venus', Mars: 'mars',
  Jupiter: 'jupiter', Saturn: 'saturn', Uranus: 'uranus', Neptune: 'neptune', Pluto: 'pluto',
}

const OUTER = new Set(['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'])

function faganAllenAyanamsa(date) {
  const yearDecimal = date.getFullYear() + date.getMonth() / 12 + date.getDate() / 365.25
  return 24.7666 + (yearDecimal - 2000.0) * 0.013969
}

function tropToSidereal(tropLng, ayanamsa) {
  return ((tropLng - ayanamsa) % 360 + 360) % 360
}

function orbBetween(a, b) {
  let diff = Math.abs(a - b) % 360
  if (diff > 180) diff = 360 - diff
  return diff
}

function aspectOrb(tLng, nLng, aspectDeg) {
  return Math.abs(orbBetween(tLng, nLng) - aspectDeg)
}

// Precompute all planet sidereal longitudes for a date range (daily)
// Returns Map<dayKey, Map<ephPlanetName, siderealLng>>
function precomputePositions(planets, startDate, endDate) {
  const cache = new Map()
  const ephNames = [...new Set(planets.map(p => PLANET_MAP[p]).filter(Boolean))]

  for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + DAY)) {
    const r = getAllPlanets(d, 37.7749, -122.4194, 0)
    const ayan = faganAllenAyanamsa(d)
    const dayKey = d.getTime()
    const positions = new Map()

    for (const eph of ephNames) {
      const trop = r.observed[eph]?.apparentLongitudeDd
      if (trop != null) {
        positions.set(eph, tropToSidereal(trop, ayan))
      }
    }
    cache.set(dayKey, positions)
  }
  return cache
}

// Get single planet position (for hourly refinement, not precomputed)
function getSiderealLng(ephPlanet, date) {
  const r = getAllPlanets(date, 37.7749, -122.4194, 0)
  const trop = r.observed[ephPlanet]?.apparentLongitudeDd
  if (trop == null) return null
  return tropToSidereal(trop, faganAllenAyanamsa(date))
}

// Hourly refinement around a daily hit
function refineHit(ephPlanet, natalLng, aspectDeg, dayBefore, dayAfter) {
  let bestOrb = Infinity
  let bestDate = dayBefore

  const start = new Date(dayBefore.getTime() - DAY)
  const end = new Date(dayAfter.getTime() + DAY)

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + HOUR)) {
    const lng = getSiderealLng(ephPlanet, d)
    if (lng == null) continue
    const orb = aspectOrb(lng, natalLng, aspectDeg)
    if (orb < bestOrb) {
      bestOrb = orb
      bestDate = new Date(d)
    }
  }

  return { date: bestDate.toISOString().slice(0, 10), orb: Math.round(bestOrb * 1000) / 1000 }
}

// Find exact hits for one transit using precomputed positions
function findHitsFromCache(cache, ephPlanet, natalLng, aspectDeg) {
  const hits = []
  let prevOrb = null
  let prevDir = null
  let prevTime = null

  const sortedTimes = [...cache.keys()].sort((a, b) => a - b)

  for (const t of sortedTimes) {
    const positions = cache.get(t)
    const lng = positions.get(ephPlanet)
    if (lng == null) continue

    const orb = aspectOrb(lng, natalLng, aspectDeg)

    if (prevOrb != null) {
      const dir = orb < prevOrb ? 'applying' : 'separating'
      if (prevDir === 'applying' && dir === 'separating' && prevOrb < 1) {
        const refined = refineHit(ephPlanet, natalLng, aspectDeg, new Date(prevTime), new Date(t))
        hits.push(refined)
      }
      prevDir = dir
    }
    prevOrb = orb
    prevTime = t
  }
  return hits
}

// Find window start/end (when transit enters/leaves orb)
function findWindow(cache, ephPlanet, natalLng, aspectDeg, maxOrb) {
  const sortedTimes = [...cache.keys()].sort((a, b) => a - b)
  let windowStart = null
  let windowEnd = null

  for (const t of sortedTimes) {
    const positions = cache.get(t)
    const lng = positions.get(ephPlanet)
    if (lng == null) continue

    const orb = aspectOrb(lng, natalLng, aspectDeg)
    if (orb <= maxOrb) {
      const dateStr = new Date(t).toISOString().slice(0, 10)
      if (!windowStart) windowStart = dateStr
      windowEnd = dateStr
    }
  }

  return windowStart ? { start: windowStart, end: windowEnd } : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { transits, natalPositions, scanYears } = req.body || {}

  // transits: array of { transitPlanet, natalPlanet, aspectDeg }
  // natalPositions: { Sun: { sidereal: 191.35 }, Mars: { sidereal: 335.28 }, ... }
  if (!transits || !Array.isArray(transits) || !natalPositions) {
    return res.status(400).json({ error: 'transits (array) and natalPositions required' })
  }

  const years = Math.min(scanYears || 2, 3) // cap at 3 years each direction
  const now = new Date()
  const scanStart = new Date(now.getTime() - years * 365 * DAY)
  const scanEnd = new Date(now.getTime() + years * 365 * DAY)

  try {
    // Collect unique transit planets needed
    const transitPlanets = [...new Set(transits.map(t => t.transitPlanet))]

    // Precompute all positions in one pass
    const cache = precomputePositions(transitPlanets, scanStart, scanEnd)

    // Process each transit
    const results = []

    for (const t of transits) {
      const ephPlanet = PLANET_MAP[t.transitPlanet]
      if (!ephPlanet) continue

      const natalPos = natalPositions[t.natalPlanet]
      if (!natalPos) continue

      const natalLng = natalPos.sidereal
      if (natalLng == null) continue

      const hits = findHitsFromCache(cache, ephPlanet, natalLng, t.aspectDeg)
      const maxOrb = OUTER.has(t.transitPlanet) ? 5 : 2
      const window = findWindow(cache, ephPlanet, natalLng, t.aspectDeg, maxOrb)

      // Current orb
      const currentLng = getSiderealLng(ephPlanet, now)
      const currentOrb = currentLng != null
        ? Math.round(aspectOrb(currentLng, natalLng, t.aspectDeg) * 1000) / 1000
        : null

      results.push({
        transitPlanet: t.transitPlanet,
        natalPlanet: t.natalPlanet,
        aspectDeg: t.aspectDeg,
        hits,
        arcType: hits.length > 1 ? 'multi-pass' : hits.length === 1 ? 'one-hit' : 'none',
        window,
        currentOrb,
      })
    }

    return res.status(200).json({
      results,
      scanRange: { start: scanStart.toISOString().slice(0, 10), end: scanEnd.toISOString().slice(0, 10) },
    })
  } catch (err) {
    console.error('ephemeris error:', err)
    return res.status(500).json({ error: err.message || 'Ephemeris calculation failed' })
  }
}
