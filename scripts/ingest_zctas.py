"""Build `public/data/zcta.geojson` — ZCTA boundary FeatureCollection.

Used by the (NICE-TO-HAVE) ER choropleth toggle. The block-context card
must-have does NOT need polygon data — it only needs ZCTA → rate, which
`er-by-zcta.json` already provides. This file exists so the choropleth
can render if Person A reaches it; if a Census TIGER pull is wired in
before stage time, swap `--source tiger` and re-run.

Until that wire-in lands, the offline path emits per-ZCTA bbox polygons
(~1.1km × 1.3km) centered on the centroids in `nyc_zctas.json`. Each
feature carries `properties.shape = "approximate_bbox"` so a renderer
can disclaim, and the README does the same. These are NOT real boundaries
— do not ship the choropleth on stage without swapping in real TIGER data.

Run:
    python scripts/ingest_zctas.py
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_OUT = Path(__file__).parent.parent / "public" / "data" / "zcta.geojson"
ZCTAS_FIXTURE = Path(__file__).parent / "fixtures" / "nyc_zctas.json"

# Approximate ZCTA half-extents (degrees). ~0.005° lat ≈ 555m, ~0.0065° lon ≈ 540m at NYC latitude.
HALF_LAT = 0.005
HALF_LON = 0.0065


def _bbox_polygon(lat, lon):
    """Closed ring polygon centered on (lat, lon)."""
    return [[
        [lon - HALF_LON, lat - HALF_LAT],
        [lon + HALF_LON, lat - HALF_LAT],
        [lon + HALF_LON, lat + HALF_LAT],
        [lon - HALF_LON, lat + HALF_LAT],
        [lon - HALF_LON, lat - HALF_LAT],
    ]]


def build_features(zctas):
    features = []
    for z in zctas:
        features.append({
            "type": "Feature",
            "properties": {
                "zcta": z["zip"],
                "name": z["name"],
                "borough": z["borough"],
                "shape": "approximate_bbox",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": _bbox_polygon(z["lat"], z["lon"]),
            },
        })
    return features


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    with open(ZCTAS_FIXTURE) as f:
        zctas = json.load(f)["zctas"]

    features = build_features(zctas)
    payload = {
        "type": "FeatureCollection",
        "metadata": {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source": "centroids from scripts/fixtures/nyc_zctas.json (approximate bbox polygons; not real ZCTA boundaries)",
            "note": "Replace with US Census TIGER ZCTA boundaries before shipping the ER choropleth on stage.",
        },
        "features": features,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    size_kb = args.out.stat().st_size / 1024
    print(f"Wrote {args.out} ({size_kb:.1f} KB) — {len(features)} ZCTA features (approximate)")


if __name__ == "__main__":
    main()
