import posthog from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY
let sessionStart = null
let isIdentified = false

if (key) {
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
  })

  // Fire session_end with duration when user leaves/tabs away
  function onLeave() {
    if (!sessionStart) return
    const now = Date.now()
    const duration_seconds = Math.round((now - sessionStart) / 1000)
    const startTime = sessionStart
    sessionStart = null // Reset immediately to prevent double-firing

    if (duration_seconds < 1) return // ignore very short sessions

    // Use sendBeacon transport to ensure delivery even when page is closing
    posthog.capture('session_end', {
      duration_seconds,
      duration_ms: now - startTime,
      session_start_time: new Date(startTime).toISOString(),
      session_end_time: new Date(now).toISOString(),
    }, { transport: 'sendBeacon' })
  }

  // Resume session when user returns to tab
  function onReturn() {
    if (sessionStart) return // already active
    if (!isIdentified) return // don't start session if not logged in
    sessionStart = Date.now()
    posthog.capture('session_resume')
  }

  // Track session end on all exit scenarios
  window.addEventListener('pagehide', onLeave)
  window.addEventListener('beforeunload', onLeave)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      onLeave()
    } else if (document.visibilityState === 'visible') {
      onReturn()
    }
  })
}

export function identify(userId) {
  if (!key) return
  posthog.identify(userId)
  isIdentified = true
}

export function capture(event, properties = {}) {
  if (!key) return
  if (event === 'session_start') sessionStart = Date.now()
  posthog.capture(event, properties)
}

export function reset() {
  if (!key) return
  sessionStart = null
  isIdentified = false
  posthog.reset()
}
