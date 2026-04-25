"""Build `public/data/aqi-grid.json` — the 200m AQI heatmap layer.

Reads current AirNow + PurpleAir sensor observations, IDW-interpolates onto a
200m grid covering all 5 NYC boroughs, classifies each cell into an EPA band,
writes JSON.

Run:
    AIRNOW_API_KEY=... python scripts/ingest_aqi.py
    # or, offline / fixture-driven (works without keys, demo-safe):
    python scripts/ingest_aqi.py
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from lib.airnow import AirNowClient
from lib.aqi import aqi_band
from lib.grid import generate_grid
from lib.idw import idw

DEFAULT_NYC_BBOX = (-74.27, 40.49, -73.68, 40.92)
DEFAULT_OUT = Path(__file__).parent.parent / "public" / "data" / "aqi-grid.json"


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bbox", nargs=4, type=float, default=DEFAULT_NYC_BBOX,
                        help="min_lon min_lat max_lon max_lat")
    parser.add_argument("--spacing", type=int, default=200, help="grid spacing in meters")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--anchor-zip", default="10001",
                        help="ZIP used to fetch sensors in offline mode (ignored — fixtures return all sensors)")
    args = parser.parse_args()

    client = AirNowClient()
    print(f"AirNow client: {'OFFLINE (fixtures)' if client.is_offline else 'LIVE'}")

    sensors = client.current_observations(zip_code=args.anchor_zip, distance=25)
    print(f"Loaded {len(sensors)} sensor observations")

    cells = build_grid(sensors, tuple(args.bbox), args.spacing)
    print(f"Built {len(cells)} grid cells at {args.spacing}m spacing")

    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "EPA AirNow + PurpleAir, IDW interpolation"
                  + (" (offline fixtures)" if client.is_offline else ""),
        "bbox": list(args.bbox),
        "spacing_m": args.spacing,
        "cells": cells,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    size_kb = args.out.stat().st_size / 1024
    print(f"Wrote {args.out} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
