import posthog from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY
let sessionStart = null

if (key) {
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
  })

  // Fire session_end with duration when user leaves
  function onLeave() {
    if (!sessionStart) return
    const duration_seconds = Math.round((Date.now() - sessionStart) / 1000)
    posthog.capture('session_end', { duration_seconds }, { transport: 'sendBeacon' })
    sessionStart = null
  }
  window.addEventListener('pagehide', onLeave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onLeave()
  })
}

export function identify(userId) {
  if (!key) return
  posthog.identify(userId)
}

export function capture(event, properties = {}) {
  if (!key) return
  if (event === 'session_start') sessionStart = Date.now()
  posthog.capture(event, properties)
}

export function reset() {
  if (!key) return
  sessionStart = null
  posthog.reset()
}
