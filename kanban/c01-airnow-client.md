---
id: 1
status: done
priority: High
blocked_by: []
assignee: "@personC"
tags: [person-c, h4, must-have, airnow, backend]
---

# C-01 — AirNow API client wrapper with offline fallback

Wrap EPA AirNow current + forecast endpoints in a Python client. Read API key from `AIRNOW_API_KEY` env var. When key is absent, transparently return fixture data so the pipeline runs offline (demo-day insurance).

## Acceptance Criteria
- `AirNowClient.current_observations(zip_code, distance=5)` returns parsed records
- `AirNowClient.forecast(zip_code, date)` returns parsed forecast records
- Missing/invalid API key → falls back to `scripts/fixtures/airnow_*.json` deterministically
- 429 / 5xx responses surface a clear error (no silent retries — fail fast for batch script)
- Rate-limit aware: client tracks call count, refuses past 500/hr safety threshold

## Narrative
- 2026-04-25: Created. AirNow free tier is 500 req/hr — fine for batch pulls but fragile if anyone re-runs the pipeline mid-demo. Offline fallback is non-negotiable insurance for the demo phone. (by @personC)
