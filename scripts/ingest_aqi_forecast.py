"""Build `public/data/aqi-forecast.json` — per-ZCTA hourly forecast.

For every NYC ZCTA, pull AirNow's forecast endpoint. If empty, fall back to
the diurnal-pattern function anchored on the latest current observation for
that ZIP. Apply hand-tuned hero overrides last.

Run:
    AIRNOW_API_KEY=... python scripts/ingest_aqi_forecast.py
    # or, offline:
    python scripts/ingest_aqi_forecast.py
"""

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from lib.airnow import AirNowClient
from lib.aqi import aqi_band
from lib.diurnal import diurnal_forecast

DEFAULT_OUT = Path(__file__).parent.parent / "public" / "data" / "aqi-forecast.json"
FIXTURES = Path(__file__).parent / "fixtures"


def _load_zctas():
    with open(FIXTURES / "nyc_zctas.json") as f:
        return json.load(f)["zctas"]


def _load_overrides():
    with open(FIXTURES / "forecast_overrides.json") as f:
        data = json.load(f)
    return {k: v for k, v in data.items() if not k.startswith("_")}


def _current_aqi_for_zip(client, zcta):
    """Best-effort current AQI for a ZIP — used to anchor the diurnal fallback."""
    try:
        sensors = client.current_observations(zip_code=zcta["zip"], distance=10)
    except Exception:
        sensors = []
    matched = [s for s in sensors if s.get("zip") == zcta["zip"]]
    if matched:
        return matched[0]["aqi"]
    # No exact match — use closest by lat/lon among returned sensors.
    if sensors:
        return sensors[0]["aqi"]
    return 80  # generic NYC moderate baseline


def _forecast_for_zcta(client, zcta, generated_at):
    """Returns (24-int list, source-string)."""
    try:
        live = client.forecast(zip_code=zcta["zip"], date=generated_at.date().isoformat())
    except Exception:
        live = None

    if live and len(live) >= 24:
        # Live AirNow returns full 24h
        if isinstance(live[0], dict):
            values = [int(round(item.get("AQI", 0))) for item in live[:24]]
        else:
            values = list(live[:24])
        # Rotate so index 0 = generated_at hour
        h = generated_at.hour
        rotated = values[h:] + values[:h]
        return rotated, "airnow_forecast"

    # Fallback path
    anchor = _current_aqi_for_zip(client, zcta)
    return diurnal_forecast(current_aqi=anchor, current_hour=generated_at.hour), "diurnal_fallback"


def _apply_overrides(values, source, overrides_for_zip):
    if not overrides_for_zip:
        return values, source
    out = list(values)
    touched = False
    for offset_str, aqi in overrides_for_zip.items():
        try:
            i = int(offset_str)
        except ValueError:
            continue
        if 0 <= i < 24:
            out[i] = int(aqi)
            touched = True
    return out, ("hand_tuned" if touched else source)


def build_forecast_payload(client, zctas, overrides, generated_at):
    out_zctas = {}
    for z in zctas:
        values, source = _forecast_for_zcta(client, z, generated_at)
        values, source = _apply_overrides(values, source, overrides.get(z["zip"]))

        hourly = []
        for i, aqi in enumerate(values):
            iso = (generated_at + timedelta(hours=i)).replace(minute=0, second=0, microsecond=0)
            hourly.append({
                "hour_offset": i,
                "iso_hour": iso.isoformat().replace("+00:00", "Z"),
                "aqi": int(aqi),
                "band": aqi_band(int(aqi)),
            })

        out_zctas[z["zip"]] = {
            "name": z["name"],
            "borough": z["borough"],
            "source": source,
            "hourly": hourly,
        }

    return {
        "schema_version": 1,
        "generated_at": generated_at.isoformat().replace("+00:00", "Z"),
        "horizon_hours": 24,
        "zctas": out_zctas,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    client = AirNowClient()
    print(f"AirNow client: {'OFFLINE (fixtures)' if client.is_offline else 'LIVE'}")

    zctas = _load_zctas()
    overrides = _load_overrides()
    generated_at = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)

    payload = build_forecast_payload(client, zctas, overrides, generated_at)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(payload, f, separators=(",", ":"))

    sources = {z["source"] for z in payload["zctas"].values()}
    size_kb = args.out.stat().st_size / 1024
    print(f"Wrote {args.out} ({size_kb:.0f} KB) — {len(payload['zctas'])} ZCTAs, sources: {sorted(sources)}")


if __name__ == "__main__":
    main()
