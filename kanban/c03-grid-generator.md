---
id: 3
status: done
priority: High
blocked_by: []
assignee: "@personC"
tags: [person-c, h4, must-have, pure-logic, tdd]
---

# C-03 — 5-borough 200m grid generator

Pure function: given a NYC bounding box, generate a list of `(lat, lon)` cell centers spaced ~200m apart, clipped to the 5-borough land area. Output drives the heatmap layer Person B renders.

## Acceptance Criteria
- `generate_grid(bbox, spacing_m=200)` returns a list of `(lat, lon)` tuples
- 200m spacing accuracy within ±20m at NYC latitude (~40.7°)
- Default NYC bbox covers all 5 boroughs (-74.27, 40.49, -73.68, 40.92)
- Cell count for default bbox sane: roughly 15k–25k cells (full grid) — clipping to land-only is a NICE-TO-HAVE
- TDD: bbox math + spacing tested before implementation

## Narrative
- 2026-04-25: Created. 200m × 5 boroughs is ~20k cells — at 24 bytes/cell that's ~500KB JSON. Acceptable for static serve. (by @personC)
