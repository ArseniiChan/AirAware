# Person C — AirAware data pipeline

Owns: EPA AirNow ingest, NYC 200m AQI grid, per-ZCTA 24h forecast, diurnal fallback, hero hand-tuning.

## What this directory produces

| File | Used by | Purpose |
|---|---|---|
| `public/data/aqi-grid.json` | Person B (heatmap layer) | 200m AQI grid across all 5 boroughs |
| `public/data/aqi-forecast.json` | Person B (time-scrubber) → Person D (recommendation matrix) | Per-ZCTA 24h hourly forecast |

Schemas: see [`docs/data-contracts.md`](../docs/data-contracts.md). Frontend enum (`good \| moderate \| sensitive \| unhealthy \| very-unhealthy \| hazardous`) matches `src/lib/aqi.ts` exactly.

## Setup

```bash
cd scripts
pip install -r requirements.txt
```

## Run the pipeline

```bash
# Offline (fixture data — works without any API key, demo-safe)
python ingest_aqi.py
python ingest_aqi_forecast.py

# Live (real EPA AirNow data)
export AIRNOW_API_KEY=your_key_here
python ingest_aqi.py
python ingest_aqi_forecast.py
```

Both scripts write into `public/data/`.

### Tuning grid spacing

Default is 200m (matches plan §2). The 5-borough grid produces ~60k cells at this spacing → ~5MB raw, ~230KB gzipped. Vercel auto-gzips static assets.

If the demo phone struggles to render 60k Mapbox features, drop to 400m (~15k cells, ~50KB gzipped):

```bash
python ingest_aqi.py --spacing 400
```

## Run the tests

```bash
cd scripts
python -m pytest -q
```

42 tests across 5 modules, all TDD-built (red → green → refactor per `.claude/skills/test-driven-development`).

## Architecture

```
scripts/
├── lib/
│   ├── aqi.py            # EPA band classifier — 0-50 good, 51-100 moderate, etc.
│   ├── diurnal.py        # 24h forecast curve when AirNow returns nothing for a ZIP
│   ├── grid.py           # NYC bbox → 200m lat/lon grid, haversine distance
│   ├── idw.py            # Inverse-distance-weighting interpolation, k=8 power=2
│   └── airnow.py         # AirNow API client + offline fixture fallback + rate guard
├── tests/                # pytest suite — 42 tests, all green
├── fixtures/
│   ├── airnow_observations.json   # 12 synthetic NYC sensors
│   ├── airnow_forecast.json       # 8 ZCTAs with 24h curves (hero ZIPs intentionally absent)
│   ├── nyc_zctas.json             # 12 NYC ZCTAs the forecast pipeline iterates over
│   └── forecast_overrides.json    # Hand-tuned hero values applied last in the pipeline
├── ingest_aqi.py         # Build aqi-grid.json
├── ingest_aqi_forecast.py # Build aqi-forecast.json
└── requirements.txt
```

## Hero flip — why the override file exists

The plan's most-memorable demo beat is *"Maya can walk at 4pm."* This requires:

- Mott Haven (10454) at **9am** to land in the **unhealthy** band so Maya (severe, age 7) gets `STAY_INSIDE`
- Same ZIP at **4pm** to drop **below AQI 50** so Maya's card flips green per `src/lib/recommendation.ts` (severe-tier cap is `MAX_AQI_BY_SEVERITY.severe = 50`)

EPA's published forecast for a Bronx ZIP often won't produce that clean a swing. `fixtures/forecast_overrides.json` is applied LAST, after the live AirNow + diurnal fallback layers, with the override values explicitly chosen to land the demo flip:

```json
{
  "10454": { "9": 162, "16": 48 }
}
```

Each ZIP's `source` field in the output JSON reflects this — overridden ZIPs report `"source": "hand_tuned"` so it shows up in dev tools (and is documented openly in this README, which judges who read it will see). We own this trade-off rather than hide it.

## Pairings (per plan §5)

- **B at H4–H8**: heatmap data → map render. Schema is locked in `data-contracts.md`; B can integrate without me by reading `public/data/aqi-grid.json` straight.
- **D at H8–H12**: forecast format → time-scrubber data layer. Same pattern — `public/data/aqi-forecast.json` is the contract.

## NICE-TO-HAVE backlog (do not start until H14 is green)

- **XGBoost forecasting upgrade** (90 days AirNow + NWS weather, held-out MAE in README) — drops in behind the scrubber if must-haves all work. EPA forecast remains the must-have driver.
- **kNN hyperlocal interpolation** — replaces IDW with kNN weighted by `1/distance² + meteorology`. Output JSON shape is identical, so it's a drop-in swap.

Both tracked as `status: backlog` cards in [`kanban/`](../kanban/).
