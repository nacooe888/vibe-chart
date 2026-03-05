// Vercel serverless function to proxy requests to Anthropic API
// Verifies Supabase JWT and enforces a 50-call/day rate limit per user.
//
// Required Vercel environment variables (in addition to ANTHROPIC_API_KEY):
//   SUPABASE_URL             — same value as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY — from Supabase dashboard → Settings → API

import { PostHog } from 'posthog-node'
import { createClient } from '@supabase/supabase-js'

const DAILY_LIMIT = 50

const noop = { captureImmediate: async () => {}, captureException: () => {}, shutdown: async () => {} }

function getPostHog() {
  if (!process.env.POSTHOG_API_KEY) return noop
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
      sizeLimit: '10mb',
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && serviceRoleKey) {
    try {
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })

      const { data: { user }, error: authError } = await admin.auth.getUser(token)
      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid or expired session' })
      }

      const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
      const { data: count, error: rpcError } = await admin.rpc('increment_api_usage', {
        p_user_id: user.id,
        p_date: today,
      })

      if (rpcError) console.error('[rate-limit] rpc error:', rpcError.message)

      if (!rpcError && count > DAILY_LIMIT) {
        return res.status(429).json({ error: 'daily reading limit reached — come back tomorrow' })
      }
    } catch (rateLimitErr) {
      console.error('[rate-limit] unexpected error:', rateLimitErr.message)
      // Degrade gracefully — let the request through rather than blocking the user
    }
  }
  // ── End rate limiting ──────────────────────────────────────────────────────

  const distinctId = req.headers['x-posthog-distinct-id'] || 'anonymous'
  const posthog = getPostHog()

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    })

    const data = await response.json()

    if (response.ok) {
      await posthog.captureImmediate({
        distinctId,
        event: 'ai_report_requested',
        properties: {
          model: req.body?.model,
          input_tokens: data.usage?.input_tokens,
          output_tokens: data.usage?.output_tokens,
        },
      })
    } else {
      await posthog.captureImmediate({
        distinctId,
        event: 'ai_report_failed',
        properties: {
          model: req.body?.model,
          status_code: response.status,
          error: data.error?.message,
        },
      })
    }

    await posthog.shutdown()
    return res.status(response.status).json(data)
  } catch (error) {
    console.error('Claude API proxy error:', error)
    posthog.captureException(error, distinctId)
    await posthog.captureImmediate({
      distinctId,
      event: 'ai_report_failed',
      properties: { error: error.message },
    })
    await posthog.shutdown()
    return res.status(500).json({ error: 'Failed to proxy request to Claude API' })
  }
}
