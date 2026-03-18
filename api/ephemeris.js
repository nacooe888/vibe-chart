// Vercel serverless function for ephemeris calculations
// Uses Swiss Ephemeris (WASM) with native sidereal Fagan-Allen mode
// Returns exact transit-to-natal aspect dates with minute-level precision

import SwissEph from 'swisseph-wasm'

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
  maxDuration: 30,
}

const PLANET_IDS = {
  Sun: 0, Moon: 1, Mercury: 2, Venus: 3, Mars: 4,
  Jupiter: 5, Saturn: 6, Uranus: 7, Neptune: 8, Pluto: 9,
  TrueNode: 11, Chiron: 15,
}

const OUTER = new Set(['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'])

// SEFLG_SIDEREAL = 65536, SEFLG_SPEED = 256
const FLAGS = 65536 | 256

const DAY_JD = 1
const HOUR_JD = 1 / 24
const MIN_JD = 1 / 1440

function orbBetween(a, b) {
  let diff = Math.abs(a - b) % 360
  if (diff > 180) diff = 360 - diff
  return diff
}

function aspectOrb(tLng, nLng, aspectDeg) {
  return Math.abs(orbBetween(tLng, nLng) - aspectDeg)
}

function dateToJd(swe, date) {
  return swe.julday(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600)
}

function jdToDateStr(jd) {
  const unixMs = (jd - 2440587.5) * 86400000
  return new Date(unixMs).toISOString().slice(0, 10)
}

function jdToIso(jd) {
  const unixMs = (jd - 2440587.5) * 86400000
  return new Date(unixMs).toISOString()
}

function getLng(swe, planetId, jd) {
  const result = swe.calc_ut(jd, planetId, FLAGS)
  return result[0]
}

// Compute natal position using Swiss Ephemeris for maximum precision
function getNatalLng(swe, planetId, birthDate, birthTime, birthLat, birthLng) {
  const jd = swe.julday(
    birthDate.getUTCFullYear(), birthDate.getUTCMonth() + 1, birthDate.getUTCDate(),
    birthDate.getUTCHours() + birthDate.getUTCMinutes() / 60
  )
  return getLng(swe, planetId, jd)
}

// Precompute daily positions for all needed transit planets
function precomputeDaily(swe, planetIds, startJd, endJd) {
  const cache = new Map()
  for (let jd = startJd; jd <= endJd; jd += DAY_JD) {
    const positions = {}
    for (const id of planetIds) {
      positions[id] = getLng(swe, id, jd)
    }
    cache.set(jd, positions)
  }
  return cache
}

// Find exact hits from precomputed daily cache, then refine to minute
function findHits(swe, cache, transitId, natalLng, aspectDeg) {
  const hits = []
  let prevOrb = null, prevDir = null, prevJd = null
  const sortedJds = [...cache.keys()].sort((a, b) => a - b)

  for (const jd of sortedJds) {
    const lng = cache.get(jd)[transitId]
    if (lng == null) continue
    const orb = aspectOrb(lng, natalLng, aspectDeg)

    if (prevOrb != null) {
      const dir = orb < prevOrb ? 'applying' : 'separating'
      if (prevDir === 'applying' && dir === 'separating' && prevOrb < 1) {
        // Refine: hourly pass
        let bestOrb = Infinity, bestJd = prevJd
        for (let h = prevJd - DAY_JD; h <= jd + DAY_JD; h += HOUR_JD) {
          const o = aspectOrb(getLng(swe, transitId, h), natalLng, aspectDeg)
          if (o < bestOrb) { bestOrb = o; bestJd = h }
        }
        // Refine: minute pass
        for (let m = bestJd - HOUR_JD; m <= bestJd + HOUR_JD; m += MIN_JD) {
          const o = aspectOrb(getLng(swe, transitId, m), natalLng, aspectDeg)
          if (o < bestOrb) { bestOrb = o; bestJd = m }
        }
        hits.push({
          date: jdToDateStr(bestJd),
          exactTime: jdToIso(bestJd),
          orb: Math.round(bestOrb * 1000000) / 1000000,
        })
      }
      prevDir = dir
    }
    prevOrb = orb
    prevJd = jd
  }
  return hits
}

// Find active window (when orb <= maxOrb)
function findWindow(cache, transitId, natalLng, aspectDeg, maxOrb) {
  let windowStart = null, windowEnd = null
  const sortedJds = [...cache.keys()].sort((a, b) => a - b)

  for (const jd of sortedJds) {
    const lng = cache.get(jd)[transitId]
    if (lng == null) continue
    const orb = aspectOrb(lng, natalLng, aspectDeg)
    if (orb <= maxOrb) {
      const dateStr = jdToDateStr(jd)
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

  if (!transits || !Array.isArray(transits) || !natalPositions) {
    return res.status(400).json({ error: 'transits (array) and natalPositions required' })
  }

  try {
    const swe = new SwissEph()
    await swe.initSwissEph()
    swe.set_sid_mode(0, 0, 0) // Fagan-Allen

    const years = Math.min(scanYears || 2, 3)
    const now = new Date()
    const nowJd = dateToJd(swe, now)
    const startJd = nowJd - years * 365.25
    const endJd = nowJd + years * 365.25

    // Collect unique transit planet IDs
    const transitIdSet = new Set()
    for (const t of transits) {
      const id = PLANET_IDS[t.transitPlanet]
      if (id != null) transitIdSet.add(id)
    }
    const transitIds = [...transitIdSet]

    // Precompute daily positions in one pass
    const cache = precomputeDaily(swe, transitIds, startJd, endJd)

    // Process each transit
    const results = []

    for (const t of transits) {
      const transitId = PLANET_IDS[t.transitPlanet]
      if (transitId == null) continue

      const natalPos = natalPositions[t.natalPlanet]
      if (!natalPos?.sidereal) continue

      const natalLng = natalPos.sidereal
      const hits = findHits(swe, cache, transitId, natalLng, t.aspectDeg)
      const maxOrb = OUTER.has(t.transitPlanet) ? 5 : 2
      const window = findWindow(cache, transitId, natalLng, t.aspectDeg, maxOrb)

      // Current orb
      const currentLng = getLng(swe, transitId, nowJd)
      const currentOrb = Math.round(aspectOrb(currentLng, natalLng, t.aspectDeg) * 1000) / 1000

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
      scanRange: { start: jdToDateStr(startJd), end: jdToDateStr(endJd) },
    })
  } catch (err) {
    console.error('ephemeris error:', err)
    return res.status(500).json({ error: err.message || 'Ephemeris calculation failed' })
  }
}
