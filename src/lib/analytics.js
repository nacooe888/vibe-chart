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
  function onLeave(useBeacon = false) {
    if (!sessionStart) return
    const duration_seconds = Math.round((Date.now() - sessionStart) / 1000)
    if (duration_seconds < 1) return // ignore very short sessions

    const options = useBeacon ? { transport: 'sendBeacon' } : {}
    posthog.capture('session_end', { duration_seconds }, options)
    sessionStart = null
  }

  // Resume session when user returns to tab
  function onReturn() {
    if (sessionStart) return // already active
    if (!isIdentified) return // don't start session if not logged in
    sessionStart = Date.now()
    posthog.capture('session_resume')
  }

  // pagehide needs sendBeacon since page is unloading
  window.addEventListener('pagehide', () => onLeave(true))

  // visibilitychange can use regular fetch
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      onLeave(false)
    } else if (document.visibilityState === 'visible') {
      onReturn()
    }
  })

  // Also try beforeunload as backup for tab close
  window.addEventListener('beforeunload', () => onLeave(true))
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
