---
id: 6
status: done
priority: High
blocked_by: [1, 2, 3, 4]
assignee: "@personC"
tags: [person-c, h4, must-have, pipeline]
---

# C-06 — `ingest_aqi.py` — current AQI grid pipeline

End-to-end batch script: pull current AirNow observations across NYC, IDW-interpolate onto the 200m grid, classify each cell into an EPA band, write `public/data/aqi-grid.json`.

## Acceptance Criteria
- Script runs offline using fixtures when `AIRNOW_API_KEY` is unset
- Output schema matches `docs/data-contracts.md` exactly (Person B reads this)
- One run produces a single JSON file under 1MB gzipped
- Failure modes (no key, all sensors offline, network error) produce a warning + fall back to fixture data
- README has the run command

## Narrative
- 2026-04-25: Created. This is the H4 deliverable. Person B's heatmap layer is blocked on this file's schema, so the contract doc must land at the same time. (by @personC)
