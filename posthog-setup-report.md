<wizard-report>
# PostHog post-wizard report

The wizard has completed a server-side PostHog integration for vibe-chart. The `posthog-node` SDK was installed and wired into both Vercel serverless API routes (`api/astro.js` and `api/claude.js`). Each handler creates a per-request PostHog client configured for serverless use (`flushAt: 1`, `flushInterval: 0`) and calls `captureImmediate` before responding to guarantee delivery. Exception autocapture is enabled on both handlers. The Supabase user ID is passed from client components to server routes via the `X-PostHog-Distinct-Id` header, enabling event correlation across the stack.

| Event | Description | File |
|-------|-------------|------|
| `natal_chart_generated` | User's natal chart successfully generated via AstroApp API | `api/astro.js` |
| `transit_chart_generated` | Current sky transit chart successfully generated via AstroApp API | `api/astro.js` |
| `chart_generation_failed` | Chart generation failed due to API error or missing credentials | `api/astro.js` |
| `ai_report_requested` | User requested an AI energy report via the Claude API proxy | `api/claude.js` |
| `ai_report_failed` | AI report request to the Claude API proxy failed | `api/claude.js` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- Dashboard: [Analytics basics](https://us.posthog.com/project/332146/dashboard/1332856)
- Insight: [Chart generation volume](https://us.posthog.com/project/332146/insights/9lWK6igy)
- Insight: [AI report requests vs failures](https://us.posthog.com/project/332146/insights/Vri5EkWR)
- Insight: [Chart generation failures by type](https://us.posthog.com/project/332146/insights/zNF1nXvW)
- Insight: [Chart to AI report funnel](https://us.posthog.com/project/332146/insights/WVlX2QHw)
- Insight: [Birth time completeness](https://us.posthog.com/project/332146/insights/pUnc450W)

Also remember to add `POSTHOG_API_KEY` and `POSTHOG_HOST` to your Vercel environment variables so events are captured in production.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/posthog-integration-javascript_node/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
