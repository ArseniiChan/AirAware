---
id: 10
status: backlog
priority: Normal
blocked_by: [4, 6]
assignee: "@personC"
tags: [person-c, h16, nice-to-have, ml]
---

# C-10 — kNN hyperlocal interpolation upgrade (NICE-TO-HAVE)

Replace IDW with a kNN regressor weighted by `1/distance² + meteorology features` (wind direction, elevation if cheaply available). Improves grid accuracy near sensor boundaries — invisible to demo viewer, sells to data-engineering judges who read the README.

## Acceptance Criteria
- Output JSON shape identical to IDW grid — drop-in swap
- README explains the upgrade + cites references
- Only attempted if H14 is green

## Narrative
- 2026-04-25: Created. Per the plan: "invisible improvement to the demo viewer. Earns credit with Susan Sun and Mohammad Manshaei when they read the README." (by @personC)
