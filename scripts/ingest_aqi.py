"""Build `public/data/aqi-grid.json` — the 200m AQI heatmap layer.

Sensor pool, in priority order:
  1. EPA AirNow per-ZCTA observations (regulatory grade, sparse)
  2. OpenAQ v3 bbox query (PM2.5 + NO2, regional)
  3. PurpleAir bbox query (community-deployed PM2.5, dense in NYC)

Sources are deduped by lat/lon + parameter, then IDW-interpolated onto a
200m grid covering all 5 boroughs. After interpolation, a synthetic NO2
boost is layered on top for cells within ~50m of major arterials (I-95,
Bruckner, BQE, FDR, LIE, Major Deegan) — the curbs where a kid walking
to school actually breathes.

Run:
    set -a; . .env.local; set +a
    python scripts/ingest_aqi.py
    # or force offline / fixture mode (committed demo asset):
    python scripts/ingest_aqi.py --demo-snapshot
"""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from lib.airnow import AirNowClient
from lib.aqi import aqi_band
from lib.grid import generate_grid
from lib.idw import idw
from lib.openaq import OpenAQClient
from lib.purpleair import PurpleAirClient
from lib.nyccas import NYCCASClient
from lib.tempo import TempoClient
from lib.no2_boost import apply_highway_boost

DEFAULT_NYC_BBOX = (-74.27, 40.49, -73.68, 40.92)
DEFAULT_OUT = Path(__file__).parent.parent / "public" / "data" / "aqi-grid.json"
FIXTURES = Path(__file__).parent / "fixtures"

ANCHOR_ZIPS = [
    "10454", "10474", "10458",            # Bronx
    "10001", "10024", "10009",            # Manhattan
    "11216", "11226", "11201",            # Brooklyn
    "11373", "11432",                     # Queens
    "10301",                              # Staten Island
]


def collect_airnow_sensors(client, anchor_zips=ANCHOR_ZIPS, distance=15):
    seen = {}
    for zip_code in anchor_zips:
        try:
            records = client.current_observations(zip_code=zip_code, distance=distance)
        except Exception as e:
            print(f"  warn: AirNow {zip_code} failed ({e})")
            continue
        for r in records:
            key = (round(r["lat"], 4), round(r["lon"], 4), r.get("parameter"))
            if key not in seen:
                seen[key] = r
    return list(seen.values())


def merge_sensors(*sources):
    """Dedupe across sources by (lat_4dp, lon_4dp, parameter). Earlier sources
    win on key collision — AirNow > OpenAQ > PurpleAir for regulatory rigor."""
    seen = {}
    counts = {}
    for source_name, sensors in sources:
        counts[source_name] = 0
        for s in sensors:
            key = (round(s["lat"], 4), round(s["lon"], 4), s.get("parameter"))
            if key not in seen:
                seen[key] = s
                counts[source_name] += 1
    return list(seen.values()), counts


def build_grid(sensors, bbox, spacing_m):
    cells = generate_grid(bbox, spacing_m=spacing_m)
    sensor_tuples = [(s["lat"], s["lon"], s["aqi"]) for s in sensors]
    out = []
    for lat, lon in cells:
        value = idw(sensor_tuples, (lat, lon))
        out.append({
            "lat": lat,
            "lon": lon,
            "aqi": value,
            "band": aqi_band(value),
            "dominant_pollutant": "PM2.5",
        })
    return out


def _load_highways():
    with open(FIXTURES / "nyc_highways.json") as f:
        data = json.load(f)
    return [h for h in data["highways"]]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bbox", nargs=4, type=float, default=DEFAULT_NYC_BBOX,
                        help="min_lon min_lat max_lon max_lat")
    parser.add_argument("--spacing", type=int, default=200, help="grid spacing in meters")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--anchor-zip", default="10001",
                        help="ZIP used to fetch AirNow sensors in offline mode")
    parser.add_argument("--demo-snapshot", action="store_true",
                        help="Force offline-fixture mode even if API keys are set. Use for "
                             "the committed demo asset — synthetic Bronx-hot fixtures give "
                             "the heatmap meaningful contrast on stage.")
    parser.add_argument("--historical-snapshot", action="store_true",
                        help="Like --demo-snapshot but uses the worst-case fixture modeled on "
                             "real bad-air NYC days (June 2023 wildfire smoke + Aug 2023 heat). "
                             "Implies --demo-snapshot. Per PLAN.md §8.4.")
    parser.add_argument("--no-highway-boost", action="store_true",
                        help="Skip the synthetic NO2 highway-proximity layer.")
    args = parser.parse_args()

    if args.demo_snapshot or args.historical_snapshot:
        # Force offline mode for ALL clients by clearing keys for this process.
        for var in ("AIRNOW_API_KEY", "OPENAQ_API_KEY", "PURPLEAIR_API_KEY"):
            os.environ.pop(var, None)

    bbox = tuple(args.bbox)

    observations_fixture = (
        "airnow_observations_historical.json"
        if args.historical_snapshot
        else "airnow_observations.json"
    )
    airnow = AirNowClient(observations_fixture=observations_fixture)
    openaq = OpenAQClient()
    purpleair = PurpleAirClient()
    nyccas = NYCCASClient()
    tempo = TempoClient()

    print(
        f"AirNow:    {'OFFLINE' if airnow.is_offline    else 'LIVE'} | "
        f"OpenAQ:    {'OFFLINE' if openaq.is_offline    else 'LIVE'} | "
        f"PurpleAir: {'OFFLINE' if purpleair.is_offline else 'LIVE'} | "
        f"NYCCAS:    {'OFFLINE' if nyccas.is_offline    else 'LIVE'} | "
        f"TEMPO:     {'OFFLINE' if tempo.is_offline     else 'LIVE'}"
    )

    # AirNow: per-ZCTA, regulatory grade
    if airnow.is_offline:
        airnow_sensors = airnow.current_observations(zip_code=args.anchor_zip, distance=25)
    else:
        print(f"  AirNow: pulling from {len(ANCHOR_ZIPS)} anchor ZIPs...")
        airnow_sensors = collect_airnow_sensors(airnow)
    print(f"  AirNow sensors: {len(airnow_sensors)}")

    # OpenAQ + PurpleAir: bbox queries, much denser if keys are set
    try:
        openaq_sensors = openaq.sensors_in_bbox(bbox)
    except Exception as e:
        print(f"  warn: OpenAQ failed ({e})")
        openaq_sensors = []
    print(f"  OpenAQ sensors: {len(openaq_sensors)}")

    try:
        purpleair_sensors = purpleair.sensors_in_bbox(bbox)
    except Exception as e:
        print(f"  warn: PurpleAir failed ({e})")
        purpleair_sensors = []
    print(f"  PurpleAir sensors: {len(purpleair_sensors)}")

    try:
        nyccas_sensors = nyccas.sensors_in_bbox(bbox)
    except Exception as e:
        print(f"  warn: NYCCAS failed ({e})")
        nyccas_sensors = []
    print(f"  NYCCAS sensors: {len(nyccas_sensors)}")

    try:
        tempo_sensors = tempo.sensors_in_bbox(bbox)
    except Exception as e:
        print(f"  warn: TEMPO failed ({e})")
        tempo_sensors = []
    print(f"  TEMPO pixels: {len(tempo_sensors)}")

    # Source priority on dedupe collisions: regulatory > NYC ground-truth >
    # community > satellite. NYCCAS calibrated better than community sensors,
    # but is annual-average so AirNow current readings still take precedence.
    sensors, contributed = merge_sensors(
        ("airnow", airnow_sensors),
        ("nyccas", nyccas_sensors),
        ("openaq", openaq_sensors),
        ("purpleair", purpleair_sensors),
        ("tempo", tempo_sensors),
    )
    print(f"  After dedupe: {len(sensors)} unique sensors (contrib: {contributed})")
    if len(sensors) < 4:
        raise SystemExit("Refusing to build a grid from <4 sensors — IDW would be meaningless.")

    cells = build_grid(sensors, bbox, args.spacing)
    print(f"Built {len(cells)} grid cells at {args.spacing}m spacing")

    if not args.no_highway_boost:
        boosted_count_before = sum(1 for c in cells if c["aqi"] >= 100)
        # Wider falloff (80m core, 160m halo) so highway corridors are visible
        # as red lines like the NYCCAS reference map shows.
        cells = apply_highway_boost(cells, _load_highways(), falloff_m=80)
        boosted_count_after = sum(1 for c in cells if c["aqi"] >= 100)
        print(f"NO2 highway boost: cells ≥AQI100 went {boosted_count_before} → {boosted_count_after}")

    fully_offline = (
        airnow.is_offline and openaq.is_offline and purpleair.is_offline
        and nyccas.is_offline and tempo.is_offline
    )
    sources_used = [s for s in (
        "AirNow" if airnow_sensors else None,
        "NYCCAS" if nyccas_sensors else None,
        "OpenAQ" if openaq_sensors else None,
        "PurpleAir" if purpleair_sensors else None,
        "TEMPO" if tempo_sensors else None,
    ) if s]
    source_str = " + ".join(sources_used) if sources_used else "fixtures"
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": f"{source_str}, IDW interpolation"
                  + (" + NO2 highway-proximity boost" if not args.no_highway_boost else "")
                  + (" (offline fixtures)" if fully_offline else ""),
        "bbox": list(args.bbox),
        "spacing_m": args.spacing,
        "cells": cells,
    }
    if args.historical_snapshot:
        payload["based_on"] = (
            "Worst-case modeled on real NYC events: "
            "June 7 2023 wildfire smoke (citywide AQI 400+) + Aug 2023 heat dome."
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    size_kb = args.out.stat().st_size / 1024
    print(f"Wrote {args.out} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
