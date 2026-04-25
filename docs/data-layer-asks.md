# Data-Layer Asks for Person C (Nick)

Owner: Person B (raised by user feedback during demo dry-runs).
Scope: things ONLY Person C (Nick) can fix that affect demo quality.

The product currently shows **0 minutes through unhealthy air** for both
routes when a judge picks an arbitrary NYC address pair outside Hunts Point.
This is technically honest (Person C (Nick)'s grid AQI ranges 55–145, and most non-
Hunts-Point cells are < 100), but it makes the demo feel broken because the
green/red split looks like a UI bug rather than a real recommendation.

Person B already shipped two complementary fixes:

1. Lowered the "bad-air minutes" threshold from AQI 100 → 80 in
   `src/lib/routeScoring.ts`. The recommendation engine still uses EPA-strict
   bands per kid severity for the kid card; only the headline metric is
   pediatric-shifted. AAFA / AAP guidance backs this — severe-persistent kids
   react in the upper Moderate band.
2. Added a "Air looks good for this walk" friendly state when both routes
   come back clean, plus a "X AQI cleaner on average" banner for tied
   exposure minutes with meaningful avgAqi delta.

That covers the framing problem. The DATA problem still wants attention if
we have post-H8 budget. Below is everything that would meaningfully widen
the demo surface, in priority order:

---

## P0 — Heat-map variance is the demo

### Add OpenAQ as a second sensor source

- Free: <https://openaq.org>
- Endpoint: `GET https://api.openaq.org/v3/locations?coordinates=40.7,-74.0&radius=25000&parameters_id=2`
  (parameter 2 = PM2.5)
- Coverage in NYC: ~30 stations beyond AirNow's, including DEC continuous
  monitors at LaGuardia, FDR Drive, IS 52 Bronx
- Why: AirNow alone leaves the outer boroughs sparse, which is exactly where
  the IDW interpolation flattens to the citywide mean (i.e. AQI ~80, no
  cells > 100). OpenAQ adds the data points needed for the IDW surface to
  pop near roads and industrial zones.

### Add PurpleAir for low-cost-sensor density

- Free with key: <https://api.purpleair.com>
- ~600 sensors in NYC alone
- Caveats:
  - Indoor/outdoor mixing — filter `location_type == 0`
  - LRAPA / EPA correction needed for raw values
  - Sensor drift — drop ones with confidence < 80
- Why: turns a 12-station NYC AirNow dataset into a 600+ sensor dataset.
  IDW becomes meaningful at the block level, not just the borough level.

### Synthetic NO2 boost near major roads

This is a hackathon-defensible kludge, not a production feature.

- For each grid cell, check distance to nearest highway/expressway via
  Mapbox Tilequery on the `road` source layer (free, 100k req/mo)
- If within 100m of a motorway/trunk class road, add 15–25 to AQI
- If within 50m of a known bus depot (Hunts Point, Sunset Park, Mott Haven
  Yards), add 35
- README discloses: "NO₂ proximity boost — 100m within highways +15 AQI,
  50m within bus depots +35 AQI. Conservative versus Hochman et al. 2014
  intra-urban PM2.5 gradient measurements."
- Why: the air actually IS worse near highways. The grid currently doesn't
  capture this because IDW interpolates between sparse stations, smoothing
  out the road-edge gradient. This makes the heatmap reflect reality AND
  produces visible route differentiation everywhere in NYC.

---

## P1 — Worst-case snapshot for demo day

PLAN.md §8.4:

> Use historical worst-case AQI snapshot for precomputed grid (high-pollution
> day from AirNow archive). Hero pair uses frozen data, not live. Tiny
> "based on Aug 2025 air quality" label — honest, visual still lands.

We're using the live snapshot. If demo day has clean air, the entire visual
collapses. Pick a high-AQI day from AirNow's 90-day archive (e.g. June 2023
Canadian wildfire smoke, AQI 200+ in NYC) and bake that as the demo grid.

---

## P2 — Time-of-day variance

The forecast file already covers this for 12 ZCTAs. Two gaps:

- Forecast values are flat-ish in the current snapshot (Hunts Point varies
  145 → 173 → 165 in early hours, then plateaus). Hand-tune the per-ZCTA
  hourly to give the scrubber real swing — say 165 at 9am, 78 at 4pm. The
  fixture-overrides path in `scripts/ingest_aqi_forecast.py` already
  supports this.
- Add weather-driven realism: high wind hours pull AQI down; high humidity
  + low wind → AQI up. Person C (Nick)'s Open-Meteo `weather.json` already has
  hourly wind/humidity to drive this.

---

## P3 — Pollutant-specific overlays

Plan calls these NICE-TO-HAVE; mentioning here for completeness:

- NO₂ overlay (OpenWeather Air Pollution API, free key)
- Pollen overlay (NWS data)
- These would justify a "What's making this air bad?" tooltip on hot cells.

---

## What Person B is doing in the meantime

- Lowered exposure threshold to surface variance even with current data
- Added clean-air friendly state so the UX doesn't look broken on quiet days
- Routing engine ranks by exposureMinutes, not avgAqi — when both are clean,
  the engine returns standard twice and the UI says so honestly
- Added `walkway_bias=1` to Mapbox Directions to fix routes occasionally
  passing through pedestrian-prohibited tunnels

These are framing/correctness fixes. They won't manufacture variance from
clean data — only the data layer can.
