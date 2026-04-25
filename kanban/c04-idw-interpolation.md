---
id: 4
status: done
priority: High
blocked_by: [3]
assignee: "@personC"
tags: [person-c, h4, must-have, pure-logic, tdd]
---

# C-04 — Inverse Distance Weighting (IDW) interpolation

Pure function: given sparse sensor points (AirNow + PurpleAir lat/lon/AQI) and a grid cell `(lat, lon)`, compute the IDW-weighted AQI value. Used to fill the 200m grid from sensor observations.

## Acceptance Criteria
- `idw(sensors, target, k=8, power=2)` returns a float
- Coincident sensor (distance ≈ 0) → returns that sensor's value (no division-by-zero)
- Empty sensor list → raises `ValueError`
- Single sensor → returns that sensor's value regardless of distance
- TDD: each behavior tested before implementation

## Narrative
- 2026-04-25: Created. IDW is the simplest defensible interpolator and matches the plan's NICE-TO-HAVE upgrade path (kNN with meteorology weighting). (by @personC)
