// Vercel serverless function for AstroApp chart calculations
// Handles JWT auth rotation, geocoding, ayanamsa conversion

import { PostHog } from 'posthog-node'

function getPostHog() {
  return new PostHog(process.env.POSTHOG_API_KEY, {
    host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  })
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}

// Module-level JWT persists across warm Lambda invocations
let currentJwt = null

const PLANET_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 15]

const PLANET_NAMES = {
  0: 'Sun', 1: 'Moon', 2: 'Mercury', 3: 'Venus', 4: 'Mars',
  5: 'Jupiter', 6: 'Saturn', 7: 'Uranus', 8: 'Neptune', 9: 'Pluto',
  11: 'TrueNode', 15: 'Chiron',
}

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

// Fagan-Allen ayanamsa: 24.7666° at J2000.0, precessing at ~50.29"/year
function faganAllenAyanamsa(dateStr) {
  const date = new Date(dateStr)
  const yearDecimal = date.getFullYear() + date.getMonth() / 12 + date.getDate() / 365.25
  return 24.7666 + (yearDecimal - 2000.0) * 0.013969
}

function tropicalToSidereal(tropLng, ayanamsa) {
  return ((tropLng - ayanamsa) % 360 + 360) % 360
}

function lngToPosition(sidLng) {
  const signIdx = Math.floor(sidLng / 30) % 12
  const withinSign = sidLng % 30
  return {
    sign: SIGNS[signIdx],
    degree: Math.floor(withinSign),
    minute: Math.round((withinSign % 1) * 60),
    sidereal: Math.round(sidLng * 1000) / 1000,
  }
}

async function geocode(location) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'vibe-chart/1.0 (vibe-chart.vercel.app)' },
  })
  const data = await res.json()
  if (!data?.length) throw new Error(`Location not found: ${location}`)
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

async function getTimezone(lat, lng) {
  try {
    const url = `https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lng}`
    const res = await fetch(url)
    const data = await res.json()
    return data.timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

async function callAstroApp(payload, apiKey, email, password) {
  async function doFetch(authHeader) {
    return fetch('https://astroapp.com/astro/apis/chart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Key': apiKey,
      },
      body: JSON.stringify(payload),
    })
  }

  // Try JWT first, fall back to Basic Auth
  let authHeader = currentJwt
    ? `Bearer ${currentJwt}`
    : `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`

  let res = await doFetch(authHeader)

  // On 401 or EXPIRED, retry with Basic Auth
  if (res.status === 401 || res.status === 403) {
    currentJwt = null
    authHeader = `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`
    res = await doFetch(authHeader)
  }

  // Save new JWT from response header
  const newJwt = res.headers.get('jwt')
  if (newJwt && newJwt !== 'EXPIRED') currentJwt = newJwt

  return res
}

function buildChartPayload(name, dateStr, timeStr, lat, lng, tz) {
  const chartDate = timeStr ? `${dateStr}T${timeStr}:00` : `${dateStr}T12:00:00`
  return {
    chart: {
      chartData: {
        chartName: name || 'Chart',
        chartDate,
        lat,
        lng,
        elev: 0,
        tz,
        zodiacID: 100,    // sidereal Fagan-Allen (API returns tropical regardless; we convert)
        houseSystemID: 4, // Campanus
        coordSys: 'G',
        version: 1,
      },
    },
    calcRequestProps: { needImage: 'N', needAspects: 'N', needSpeeds: 'Y' },
    params: { objects: PLANET_IDS },
  }
}

function parseAstroResponse(data, ayanamsa) {
  const positions = {}

  // Parse planets from objects array
  if (Array.isArray(data.objects)) {
    data.objects.forEach(obj => {
      const name = PLANET_NAMES[obj.id]
      if (name && obj.lng != null) {
        const sidLng = tropicalToSidereal(obj.lng, ayanamsa)
        positions[name] = {
          ...lngToPosition(sidLng),
          tropical: Math.round(obj.lng * 1000) / 1000,
          retrograde: typeof obj.spd === 'number' ? obj.spd < 0 : false,
          speed: typeof obj.spd === 'number' ? Math.round(obj.spd * 10000) / 10000 : null,
        }
      }
    })
  }

  // Parse ASC (house cusp 1) and MC (house cusp 10)
  if (Array.isArray(data.houseCusps)) {
    const ascTrop = data.houseCusps[1]
    const mcTrop = data.houseCusps[10]
    if (ascTrop != null) {
      positions.ASC = { ...lngToPosition(tropicalToSidereal(ascTrop, ayanamsa)), tropical: Math.round(ascTrop * 1000) / 1000 }
    }
    if (mcTrop != null) {
      positions.MC = { ...lngToPosition(tropicalToSidereal(mcTrop, ayanamsa)), tropical: Math.round(mcTrop * 1000) / 1000 }
    }
  }

  return positions
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ASTROAPP_API_KEY
  const email = process.env.ASTROAPP_EMAIL
  const password = process.env.ASTROAPP_PASSWORD

  if (!apiKey || !email || !password) {
    return res.status(500).json({ error: 'AstroApp credentials not configured in Vercel environment variables' })
  }

  const { type, birthDate, birthTime, birthLocation, name } = req.body || {}
  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
  const posthog = getPostHog()

  try {
    if (type === 'natal') {
      if (!birthDate || !birthLocation) {
        return res.status(400).json({ error: 'birthDate and birthLocation required for natal chart' })
      }

      const coords = await geocode(birthLocation)
      const tz = await getTimezone(coords.lat, coords.lng)
      const ayanamsa = faganAllenAyanamsa(birthDate)

      const payload = buildChartPayload(name, birthDate, birthTime || null, coords.lat, coords.lng, tz)
      const astroRes = await callAstroApp(payload, apiKey, email, password)

      if (!astroRes.ok) {
        const errText = await astroRes.text()
        await posthog.captureImmediate({
          distinctId,
          event: 'chart_generation_failed',
          properties: { chart_type: 'natal', status_code: astroRes.status, error: errText },
        })
        await posthog.shutdown()
        return res.status(502).json({ error: `AstroApp error (${astroRes.status}): ${errText}` })
      }

      const astroData = await astroRes.json()
      const positions = parseAstroResponse(astroData, ayanamsa)

      const dateDisplay = new Date(birthDate + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })

      await posthog.captureImmediate({
        distinctId,
        event: 'natal_chart_generated',
        properties: {
          has_birth_time: !!birthTime,
          birth_location: birthLocation,
          ayanamsa: 'sidereal Fagan-Allen',
        },
      })
      await posthog.shutdown()
      return res.status(200).json({
        type: 'natal',
        date: dateDisplay,
        location: birthLocation,
        ayanamsa: 'sidereal Fagan-Allen',
        ayanamsaDeg: Math.round(ayanamsa * 10000) / 10000,
        fetchedAt: new Date().toISOString(),
        positions,
      })
    }

    if (type === 'transits') {
      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10)
      const timeStr = now.toTimeString().slice(0, 5)

      // San Francisco as default transit location (planet positions are global)
      const SF_LAT = 37.7749
      const SF_LNG = -122.4194
      const SF_TZ = 'America/Los_Angeles'

      const ayanamsa = faganAllenAyanamsa(dateStr)
      const payload = buildChartPayload('Transits', dateStr, timeStr, SF_LAT, SF_LNG, SF_TZ)
      const astroRes = await callAstroApp(payload, apiKey, email, password)

      if (!astroRes.ok) {
        const errText = await astroRes.text()
        await posthog.captureImmediate({
          distinctId,
          event: 'chart_generation_failed',
          properties: { chart_type: 'transits', status_code: astroRes.status, error: errText },
        })
        await posthog.shutdown()
        return res.status(502).json({ error: `AstroApp error (${astroRes.status}): ${errText}` })
      }

      const astroData = await astroRes.json()
      // Debug: log raw object keys to understand AstroApp response shape
      if (Array.isArray(astroData.objects) && astroData.objects.length > 0) {
        console.log('[astro debug] raw object keys:', JSON.stringify(Object.keys(astroData.objects[0])))
        console.log('[astro debug] Sun raw:', JSON.stringify(astroData.objects[0]))
      }
      const positions = parseAstroResponse(astroData, ayanamsa)

      const dateDisplay = now.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })

      await posthog.captureImmediate({
        distinctId,
        event: 'transit_chart_generated',
        properties: { date: dateStr, ayanamsa: 'sidereal Fagan-Allen' },
      })
      await posthog.shutdown()
      return res.status(200).json({
        type: 'transits',
        date: dateDisplay,
        location: 'San Francisco',
        ayanamsa: 'sidereal Fagan-Allen',
        ayanamsaDeg: Math.round(ayanamsa * 10000) / 10000,
        fetchedAt: new Date().toISOString(),
        positions,
      })
    }

    await posthog.shutdown()
    return res.status(400).json({ error: 'type must be "natal" or "transits"' })
  } catch (err) {
    console.error('astro handler error:', err)
    posthog.captureException(err, distinctId)
    await posthog.captureImmediate({
      distinctId,
      event: 'chart_generation_failed',
      properties: { chart_type: type, error: err.message },
    })
    await posthog.shutdown()
    return res.status(500).json({ error: err.message || 'Chart calculation failed' })
  }
}
