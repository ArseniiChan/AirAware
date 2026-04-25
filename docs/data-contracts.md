# AirAware Data Contracts

Owner: Person C. This file is the single source of truth for the JSON shapes Person C produces and Persons B and D consume. Any field rename or shape change MUST bump `schema_version` and be announced in the team channel.

All files live under `public/data/` so they're served as static assets by Next.js. All values are in EPA AQI units (PM2.5 + Ozone composite, 0–500+ scale).

---

## 1. `aqi-grid.json` — current AQI grid (consumed by Person B's heatmap layer)

**Purpose**: 200×200m AQI grid covering all 5 NYC boroughs, refreshed once per pipeline run.

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-04-25T18:00:00Z",
  "source": "EPA AirNow + PurpleAir, IDW interpolation",
  "bbox": [-74.27, 40.49, -73.68, 40.92],
  "spacing_m": 200,
  "cells": [
    {
      "lat": 40.8075,
      "lon": -73.9171,
      "aqi": 142,
      "band": "sensitive",
      "dominant_pollutant": "PM2.5"
    }
  ]
}
```

### Field reference

| Field | Type | Notes |
|---|---|---|
| `schema_version` | int | Bump on shape change |
| `generated_at` | ISO 8601 UTC | When the pipeline ran |
| `source` | string | Human-readable provenance for the README + tooltip |
| `bbox` | `[minLon, minLat, maxLon, maxLat]` | Outer envelope; cells are clipped within |
| `spacing_m` | int | Grid spacing in meters |
| `cells[].lat`, `.lon` | float | Cell center; 4 decimals (~10m precision) |
| `cells[].aqi` | int | 0–500+ |
| `cells[].band` | enum | One of `good \| moderate \| sensitive \| unhealthy \| very-unhealthy \| hazardous` (matches `AqiBand` in `src/lib/aqi.ts`) |
| `cells[].dominant_pollutant` | enum | `PM2.5 \| PM10 \| OZONE \| NO2 \| SO2 \| CO` |

### How Person B consumes this

```ts
// In components/map/HeatmapLayer.tsx
const grid: AqiGrid = await fetch('/data/aqi-grid.json').then(r => r.json());
const features = grid.cells.map(c => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
  properties: { aqi: c.aqi, band: c.band }
}));
// Pipe into Mapbox GL `heatmap-weight` or a custom symbol layer
```

---

## 2. `aqi-forecast.json` — per-ZCTA hourly forecast (consumed by Person D's time-scrubber)

**Purpose**: Drives the time-scrubber. For every NYC ZCTA, 24 hourly AQI values starting from `generated_at`'s hour.

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-04-25T18:00:00Z",
  "horizon_hours": 24,
  "zctas": {
    "10454": {
      "name": "Mott Haven",
      "borough": "Bronx",
      "source": "airnow_forecast",
      "hourly": [
        { "hour_offset": 0, "iso_hour": "2026-04-25T18:00:00Z", "aqi": 138, "band": "sensitive" },
        { "hour_offset": 1, "iso_hour": "2026-04-25T19:00:00Z", "aqi": 124, "band": "sensitive" }
      ]
    },
    "10474": {
      "name": "Hunts Point",
      "borough": "Bronx",
      "source": "diurnal_fallback",
      "hourly": [/* ...24 entries... */]
    }
  }
}
```

### Field reference

| Field | Type | Notes |
|---|---|---|
| `horizon_hours` | int | Always 24 for the demo |
| `zctas[code].source` | enum | `airnow_forecast \| diurnal_fallback \| hand_tuned` — surfaced in dev tools, never in UI |
| `zctas[code].hourly[]` | array of 24 | Always exactly 24 entries; ordered by `hour_offset` ascending |
| `hour_offset` | int | 0 = `generated_at` hour, 23 = 23h ahead |
| `iso_hour` | ISO 8601 UTC | Top-of-hour timestamp |

### How Person B consumes this (time-scrubber wiring per plan §5)

```ts
// Person B builds the seam: forecast AQI → synthesised RouteExposure → recommend()
const forecast: AqiForecast = await fetch('/data/aqi-forecast.json').then(r => r.json());
const futureAqi = forecast.zctas[originZcta].hourly[scrubberHour].aqi;
const currentAqi = forecast.zctas[originZcta].hourly[0].aqi;

// Scale the route's exposure proportionally to forecasted vs current AQI
const scale = futureAqi / Math.max(currentAqi, 1);
const futureExposure: RouteExposure = {
  avgAqi: Math.round(baseRoute.avgAqi * scale),
  maxAqi: Math.round(baseRoute.maxAqi * scale),
  exposureMinutes: baseRoute.exposureMinutes,  // route doesn't change, only AQI
  totalMinutes: baseRoute.totalMinutes,
};
const recommendation = recommend(kid, { standard: futureExposure, atlas: ... });
```

Person C only commits to producing `forecast.zctas[code].hourly[i].aqi`. The exposure-scaling math is Person B's seam.

### Hand-tuning the hero scenario

The demo flip ("Maya can walk at 4pm") depends on Mott Haven (10454) and Hunts Point (10474) hitting specific bands at specific hours. The pipeline reads `scripts/fixtures/forecast_overrides.json` LAST, after the API/fallback layers, so tuning is a one-line edit:

```json
{
  "10454": {
    "9": 162,
    "16": 95
  }
}
```

This is documented openly — judges who read the README will see "hero forecast values curated for demo clarity" and we own that.

---

## 3. `er-by-zcta.json` — owned by Person A, documented here for completeness

Person C does not write this — Person A does — but it's listed so anyone reading this file has the full data layer in one place.

```jsonc
{
  "schema_version": 1,
  "source": "NYC DOHMH Asthma ED Visit Rate by ZCTA (aggregated from SPARCS)",
  "nyc_avg_per_10k": 92.4,
  "zctas": {
    "10454": {
      "name": "Mott Haven",
      "rate_per_10k_children": 412.7,
      "visits": 187,
      "ratio_to_nyc_avg": 4.47,
      "one_in_n": 24
    }
  }
}
```

---

## Versioning rules

- Adding an OPTIONAL field: no version bump
- Renaming, removing, or changing the type of any field: bump `schema_version` and announce
- Consumers should fail loudly (not silently) on unknown `schema_version` values
