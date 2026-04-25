---
id: 5
status: done
priority: High
blocked_by: []
assignee: "@personC"
tags: [person-c, h4, must-have, pure-logic, tdd]
---

# C-05 — Diurnal-pattern forecast fallback

Pure function: when AirNow's forecast endpoint returns nothing for a ZCTA, generate a plausible 24h forecast curve based on time-of-day patterns (rush-hour peaks, overnight troughs). Anchored by the most recent observed AQI value for that ZIP.

## Acceptance Criteria
- `diurnal_forecast(current_aqi: int, current_hour: int) -> List[int]` returns 24 hourly values
- Output values stay within ±40% of `current_aqi` (no wild swings)
- Curve has a morning rush peak (7–9am) and afternoon trough (2–4pm) — the demo flip moment
- Output is deterministic given same input
- TDD: shape constraints + boundary hours (0, 23) tested

## Narrative
- 2026-04-25: Created. The plan calls this a "diurnal-pattern fallback" — acknowledging the time-scrubber demo beat ("Maya can walk at 4pm") cannot survive a missing forecast for the hero ZIP. This function makes the demo robust against a flat/empty AirNow forecast response. (by @personC)
