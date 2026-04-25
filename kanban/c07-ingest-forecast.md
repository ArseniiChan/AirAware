---
id: 7
status: done
priority: High
blocked_by: [1, 2, 5]
assignee: "@personC"
tags: [person-c, h4, must-have, pipeline]
---

# C-07 — `ingest_aqi_forecast.py` — per-ZCTA forecast pipeline

For every NYC ZCTA, call AirNow's forecast endpoint and persist 24 hourly values. When the forecast endpoint returns nothing, fall back to `diurnal_forecast` anchored on the latest observed AQI. Output `public/data/aqi-forecast.json`.

## Acceptance Criteria
- Output schema matches `docs/data-contracts.md` (Person D's scrubber reads this)
- Every NYC ZCTA has 24 hourly entries (no gaps in the demo path)
- ZIPs that hit the fallback are flagged with `source: "diurnal_fallback"` for transparency
- Hero ZCTAs (Mott Haven 10454, Hunts Point 10474) hand-tunable to land Maya's flip at 4pm
- Runs offline from fixtures when API key is unset

## Narrative
- 2026-04-25: Created. The hero-flip demo beat depends on this file being right for two specific ZCTAs. Hand-tunability is preserved by reading from `scripts/fixtures/forecast_overrides.json` last, after the API/fallback layers. (by @personC)
