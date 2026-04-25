---
id: 2
status: done
priority: High
blocked_by: []
assignee: "@personC"
tags: [person-c, h4, must-have, pure-logic, tdd]
---

# C-02 — AQI band classifier (EPA bands)

Pure function: `aqi_band(value: int) -> str` returning one of `good | moderate | usg | unhealthy | very_unhealthy | hazardous`. Mirrors EPA AQI category breakpoints exactly. This is one of the load-bearing primitives — D's recommendation matrix consumes the band, not the raw integer.

## Acceptance Criteria
- 0–50 → `good`, 51–100 → `moderate`, 101–150 → `usg`, 151–200 → `unhealthy`, 201–300 → `very_unhealthy`, 301+ → `hazardous`
- Negative or `None` input → raises `ValueError`
- Boundary values (50, 51, 100, 101, 150, 151, 200, 201, 300, 301) tested explicitly
- Built TDD: every band has a failing test before the implementation exists

## Narrative
- 2026-04-25: Created. EPA bands are public + frozen — the test cases are the spec. (by @personC)
