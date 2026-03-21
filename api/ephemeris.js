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

// ── Sky Events: retrogrades, stations, moon phases ─────────────────────────

const PLANET_NAMES = { 0:'Sun', 1:'Moon', 2:'Mercury', 3:'Venus', 4:'Mars', 5:'Jupiter', 6:'Saturn', 7:'Uranus', 8:'Neptune', 9:'Pluto', 11:'TrueNode', 15:'Chiron' }
const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']
const RETRO_PLANETS = [2, 3, 4, 5, 6, 7, 8, 9] // Mercury through Pluto (not Sun/Moon)

function lngToSign(lng) {
  const idx = Math.floor(((lng % 360) + 360) % 360 / 30) % 12
  const deg = Math.floor(((lng % 360) + 360) % 360 % 30)
  const min = Math.round((((lng % 360) + 360) % 360 % 1) * 60)
  return { sign: SIGNS[idx], degree: deg, minute: min }
}

// Determine house from Campanus cusps array (0-indexed: cusps[0] = 1st house)
function lngToHouse(lng, cusps) {
  if (!cusps || cusps.length < 12) return null
  const normLng = ((lng % 360) + 360) % 360
  for (let h = 0; h < 12; h++) {
    const cusp = ((cusps[h] % 360) + 360) % 360
    const nextCusp = ((cusps[(h + 1) % 12] % 360) + 360) % 360
    if (nextCusp > cusp) {
      if (normLng >= cusp && normLng < nextCusp) return h + 1
    } else {
      if (normLng >= cusp || normLng < nextCusp) return h + 1
    }
  }
  return 1
}

function computeSkyEvents(swe, nowJd, cusps, tzOffsetMin) {
  // Convert JD to date string in user's local timezone
  const jdToLocalDateStr = (jd) => {
    const unixMs = (jd - 2440587.5) * 86400000
    const local = new Date(unixMs - (tzOffsetMin || 0) * 60000)
    return local.toISOString().slice(0, 10)
  }
  const FLAGS = 65536 | 256 // SEFLG_SIDEREAL | SEFLG_SPEED
  const events = []

  const INNER_PLANETS = new Set([2, 3, 4]) // Mercury, Venus, Mars
  const isInner = (pid) => INNER_PLANETS.has(pid)

  // 1a. Currently retrograde planets — find station direct date (forward scan)
  for (const pid of RETRO_PLANETS) {
    const result = swe.calc_ut(nowJd, pid, FLAGS)
    const speed = result[3]
    const name = PLANET_NAMES[pid]

    if (speed < 0) {
      let stationJd = null
      let stationLng = null
      for (let jd = nowJd; jd < nowJd + 365; jd += DAY_JD) {
        const r = swe.calc_ut(jd, pid, FLAGS)
        if (r[3] >= 0) {
          for (let h = jd - DAY_JD; h <= jd; h += HOUR_JD) {
            const rh = swe.calc_ut(h, pid, FLAGS)
            if (rh[3] >= 0) { stationJd = h; stationLng = rh[0]; break }
          }
          break
        }
      }
      if (stationJd) {
        const pos = lngToSign(stationLng)
        events.push({
          type: 'retrograde-station',
          planet: name,
          status: 'retrograde',
          stationDate: jdToLocalDateStr(stationJd),
          stationTime: jdToIso(stationJd),
          sign: pos.sign,
          degree: pos.degree,
          minute: pos.minute,
          house: cusps ? lngToHouse(stationLng, cusps) : null,
          daysUntil: Math.round(stationJd - nowJd),
        })
      }
    }
  }

  // 1b. Recent station directs — planet just went direct (backward scan)
  for (const pid of RETRO_PLANETS) {
    const result = swe.calc_ut(nowJd, pid, FLAGS)
    const speed = result[3]
    const name = PLANET_NAMES[pid]
    const lingerDays = isInner(pid) ? 5 : 10

    if (speed >= 0) {
      // Scan backward up to 10 days to find when speed crossed from negative to positive
      let stationJd = null
      let stationLng = null
      for (let jd = nowJd; jd > nowJd - 10; jd -= DAY_JD) {
        const r = swe.calc_ut(jd, pid, FLAGS)
        if (r[3] < 0) {
          // Found retrograde — station direct is between jd and jd+1
          for (let h = jd; h <= jd + DAY_JD; h += HOUR_JD) {
            const rh = swe.calc_ut(h, pid, FLAGS)
            if (rh[3] >= 0) { stationJd = h; stationLng = rh[0]; break }
          }
          break
        }
      }
      if (stationJd) {
        const daysAgo = Math.round(nowJd - stationJd)
        if (daysAgo <= lingerDays) {
          const pos = lngToSign(stationLng)
          events.push({
            type: 'station-direct',
            planet: name,
            stationDate: jdToLocalDateStr(stationJd),
            stationTime: jdToIso(stationJd),
            sign: pos.sign,
            degree: pos.degree,
            minute: pos.minute,
            house: cusps ? lngToHouse(stationLng, cusps) : null,
            daysUntil: -daysAgo,
            lingerDays,
          })
        }
      }
    }
  }

  // 1c. Upcoming station retrogrades — planet about to go retrograde (forward scan)
  for (const pid of RETRO_PLANETS) {
    const result = swe.calc_ut(nowJd, pid, FLAGS)
    const speed = result[3]
    const name = PLANET_NAMES[pid]

    if (speed > 0) {
      let stationJd = null
      let stationLng = null
      for (let jd = nowJd; jd < nowJd + 30; jd += DAY_JD) {
        const r = swe.calc_ut(jd, pid, FLAGS)
        if (r[3] < 0) {
          // Refine to hour
          for (let h = jd - DAY_JD; h <= jd; h += HOUR_JD) {
            const rh = swe.calc_ut(h, pid, FLAGS)
            if (rh[3] < 0) { stationJd = h; stationLng = rh[0]; break }
          }
          break
        }
      }
      if (stationJd) {
        const pos = lngToSign(stationLng)
        events.push({
          type: 'station-retrograde',
          planet: name,
          stationDate: jdToLocalDateStr(stationJd),
          stationTime: jdToIso(stationJd),
          sign: pos.sign,
          degree: pos.degree,
          minute: pos.minute,
          house: cusps ? lngToHouse(stationLng, cusps) : null,
          daysUntil: Math.round(stationJd - nowJd),
        })
      }
    }
  }

  // 2. Moon phases — only show the NEXT upcoming phase
  const PHASES = [
    { deg: 0, label: 'new-moon', name: 'new moon', icon: '🌑' },
    { deg: 90, label: 'first-quarter', name: 'first quarter moon', icon: '🌓' },
    { deg: 180, label: 'full-moon', name: 'full moon', icon: '🌕' },
    { deg: 270, label: 'third-quarter', name: 'third quarter moon', icon: '🌗' },
  ]

  const currentSun = swe.calc_ut(nowJd, 0, FLAGS)[0]
  const currentMoon = swe.calc_ut(nowJd, 1, FLAGS)[0]
  const currentElong = ((currentMoon - currentSun) % 360 + 360) % 360

  const nextPhaseIdx = PHASES.findIndex(p => p.deg > currentElong) !== -1
    ? PHASES.findIndex(p => p.deg > currentElong)
    : 0

  const nextPhase = PHASES[nextPhaseIdx]
  for (let jd = nowJd; jd < nowJd + 35; jd += 0.25) {
    const sun = swe.calc_ut(jd, 0, FLAGS)[0]
    const moon = swe.calc_ut(jd, 1, FLAGS)[0]
    const elong = ((moon - sun) % 360 + 360) % 360
    const orb = Math.abs(elong - nextPhase.deg)
    if (orb < 3) {
      let bestOrb = orb, bestJd = jd, bestMoon = moon
      for (let h = jd - 0.5; h <= jd + 0.5; h += HOUR_JD) {
        const s = swe.calc_ut(h, 0, FLAGS)[0]
        const m = swe.calc_ut(h, 1, FLAGS)[0]
        const o = Math.abs(((m - s) % 360 + 360) % 360 - nextPhase.deg)
        if (o < bestOrb) { bestOrb = o; bestJd = h; bestMoon = m }
      }
      const moonPos = lngToSign(bestMoon)
      events.push({
        type: nextPhase.label,
        name: nextPhase.name,
        date: jdToLocalDateStr(bestJd),
        time: jdToIso(bestJd),
        sign: moonPos.sign,
        degree: moonPos.degree,
        minute: moonPos.minute,
        house: cusps ? lngToHouse(bestMoon, cusps) : null,
        daysUntil: Math.round(bestJd - nowJd),
      })
      break
    }
  }

  // 3. Recent sign ingresses — planet just entered a new sign
  const INGRESS_PLANETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] // Sun through Pluto
  for (const pid of INGRESS_PLANETS) {
    const name = PLANET_NAMES[pid]
    const lingerDays = (pid <= 4) ? 3 : 7 // inner planets 3 days, outer 7 days
    const lookback = lingerDays

    const nowLng = swe.calc_ut(nowJd, pid, FLAGS)[0]
    const nowSign = lngToSign(nowLng).sign
    const pastLng = swe.calc_ut(nowJd - lookback, pid, FLAGS)[0]
    const pastSign = lngToSign(pastLng).sign

    if (nowSign !== pastSign) {
      // Sign changed — scan to find the exact ingress date
      let ingressJd = null
      let ingressLng = null
      for (let jd = nowJd - lookback; jd <= nowJd; jd += HOUR_JD * 6) {
        const lng = swe.calc_ut(jd, pid, FLAGS)[0]
        const sign = lngToSign(lng).sign
        if (sign === nowSign) {
          // Refine to hour
          for (let h = jd - HOUR_JD * 6; h <= jd; h += HOUR_JD) {
            const hl = swe.calc_ut(h, pid, FLAGS)[0]
            if (lngToSign(hl).sign === nowSign) { ingressJd = h; ingressLng = hl; break }
          }
          break
        }
      }
      if (ingressJd) {
        const daysAgo = Math.round(nowJd - ingressJd)
        const pos = lngToSign(ingressLng)
        events.push({
          type: 'sign-ingress',
          planet: name,
          sign: pos.sign,
          degree: pos.degree,
          minute: pos.minute,
          date: jdToLocalDateStr(ingressJd),
          house: cusps ? lngToHouse(ingressLng, cusps) : null,
          daysUntil: -daysAgo,
          lingerDays,
        })
      }
    }
  }

  // 4. Mundane transit-to-transit aspects (slow planet pairs)
  const ASPECT_DEFS = [
    { name: 'conjunction', deg: 0, orb: 2 },
    { name: 'sextile', deg: 60, orb: 2 },
    { name: 'square', deg: 90, orb: 2 },
    { name: 'trine', deg: 120, orb: 2 },
    { name: 'opposition', deg: 180, orb: 2 },
  ]
  // Only outer planet pairs (Jupiter through Pluto) for meaningful slow aspects
  const MUNDANE_PLANETS = [5, 6, 7, 8, 9] // Jupiter, Saturn, Uranus, Neptune, Pluto
  for (let i = 0; i < MUNDANE_PLANETS.length; i++) {
    for (let j = i + 1; j < MUNDANE_PLANETS.length; j++) {
      const pidA = MUNDANE_PLANETS[i]
      const pidB = MUNDANE_PLANETS[j]
      const nameA = PLANET_NAMES[pidA]
      const nameB = PLANET_NAMES[pidB]
      const lngA = swe.calc_ut(nowJd, pidA, FLAGS)[0]
      const lngB = swe.calc_ut(nowJd, pidB, FLAGS)[0]

      for (const asp of ASPECT_DEFS) {
        const orb = aspectOrb(lngA, lngB, asp.deg)
        if (orb <= asp.orb) {
          // Currently in aspect — find if it's applying or separating, and when exact
          const posA = lngToSign(lngA)
          const posB = lngToSign(lngB)

          // Scan nearby to find exact date (within 60 days back/forward)
          let bestOrb = orb, bestJd = nowJd
          for (let jd = nowJd - 60; jd <= nowJd + 60; jd += DAY_JD) {
            const a = swe.calc_ut(jd, pidA, FLAGS)[0]
            const b = swe.calc_ut(jd, pidB, FLAGS)[0]
            const o = aspectOrb(a, b, asp.deg)
            if (o < bestOrb) { bestOrb = o; bestJd = jd }
          }
          // Refine to hour
          for (let h = bestJd - DAY_JD; h <= bestJd + DAY_JD; h += HOUR_JD) {
            const a = swe.calc_ut(h, pidA, FLAGS)[0]
            const b = swe.calc_ut(h, pidB, FLAGS)[0]
            const o = aspectOrb(a, b, asp.deg)
            if (o < bestOrb) { bestOrb = o; bestJd = h }
          }

          const daysFromNow = Math.round(bestJd - nowJd)
          // Skip if exact hit was more than 10 days ago
          if (daysFromNow < -10) break
          events.push({
            type: 'mundane-aspect',
            planetA: nameA,
            planetB: nameB,
            aspect: asp.name,
            aspectDeg: asp.deg,
            orb: Math.round(orb * 100) / 100,
            exactDate: jdToLocalDateStr(bestJd),
            signA: posA.sign,
            degreeA: posA.degree,
            minuteA: posA.minute,
            signB: posB.sign,
            degreeB: posB.degree,
            minuteB: posB.minute,
            houseA: cusps ? lngToHouse(lngA, cusps) : null,
            houseB: cusps ? lngToHouse(lngB, cusps) : null,
            daysUntil: daysFromNow,
            lingerDays: 10,
          })
          break // only show closest aspect per pair
        }
      }
    }
  }

  // Sort: today first, then recent past (by recency), then upcoming (by soonest)
  events.sort((a, b) => {
    const da = a.daysUntil ?? 999
    const db = b.daysUntil ?? 999
    // Today (0) comes first
    if (da === 0 && db !== 0) return -1
    if (db === 0 && da !== 0) return 1
    // Past events (negative) sorted by recency (closest to 0 first)
    if (da < 0 && db < 0) return db - da
    // Past before future
    if (da < 0 && db > 0) return -1
    if (da > 0 && db < 0) return 1
    // Future events sorted by soonest
    return da - db
  })
  return events
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { type, transits, natalPositions, scanYears } = req.body || {}

  // Sky events mode
  if (type === 'skyEvents') {
    const { tzOffsetMin } = req.body || {}
    try {
      const swe = new SwissEph()
      await swe.initSwissEph()
      swe.set_sid_mode(0, 0, 0)
      const nowJd = dateToJd(swe, new Date())

      // Use Campanus cusps from AstroApp natal chart if available
      const cusps = natalPositions?._cusps || null

      // Timezone offset for displaying dates in user's local time
      const tzOffset = typeof tzOffsetMin === 'number' ? tzOffsetMin : 0

      const events = computeSkyEvents(swe, nowJd, cusps, tzOffset)
      return res.status(200).json({ events })
    } catch (err) {
      console.error('skyEvents error:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  // Transit aspects mode (existing)
  if (!transits || !Array.isArray(transits) || !natalPositions) {
    return res.status(400).json({ error: 'transits (array) and natalPositions required, or type: "skyEvents"' })
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
