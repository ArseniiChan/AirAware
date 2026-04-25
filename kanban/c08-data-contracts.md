---
id: 8
status: done
priority: High
blocked_by: []
assignee: "@personC"
tags: [person-c, h4, must-have, docs, integration]
---

# C-08 — `docs/data-contracts.md` — schemas for B and D

Document the exact JSON shapes Person C produces so B's heatmap layer and D's scrubber can integrate without waiting for me. One source of truth — both consumers reference this file.

## Acceptance Criteria
- `aqi-grid.json` schema: cell shape, band enum, units, sample record
- `aqi-forecast.json` schema: per-ZCTA hourly entries, source field, sample record
- `er-by-zcta.json` schema: documented even though Person A owns it (so I can read from it for cross-checks)
- Worked example: how B reads a grid cell into a Mapbox heatmap layer; how D reads forecast for the active hour
- Schema version field on every output file so a future change is detectable

## Narrative
- 2026-04-25: Created. This is the artifact that prevents the H4–H8 pair-coding session with B from being a schema-design meeting. Lock contracts early; iterate on data quality, not data shape. (by @personC)
