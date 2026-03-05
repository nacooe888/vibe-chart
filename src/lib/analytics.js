import posthog from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY

if (key) {
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: false,
  })
}

export function identify(userId) {
  if (!key) return
  posthog.identify(userId)
}

export function capture(event, properties = {}) {
  if (!key) return
  posthog.capture(event, properties)
}

export function reset() {
  if (!key) return
  posthog.reset()
}
