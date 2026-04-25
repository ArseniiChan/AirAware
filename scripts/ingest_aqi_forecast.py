"""Build `public/data/aqi-forecast.json` and `public/data/weather.json`.

Per-ZCTA 24h hourly forecast. Priority chain:
  1. Open-Meteo `us_aqi` hourly per-ZCTA-centroid (24 real hourly values)
  2. AirNow daily peak + our diurnal model (when Open-Meteo unavailable)
  3. Current AirNow observation + diurnal (last-resort fallback)
  4. Hand-tuned hero overrides applied LAST, regardless of source

Also writes `weather.json` — city-wide hourly temp/wind/humidity from
Open-Meteo, used by D's recommendation copy and B's NICE-TO-HAVE XGBoost.

Run:
    AIRNOW_API_KEY=... python scripts/ingest_aqi_forecast.py
    # or, force fixtures-only:
    python scripts/ingest_aqi_forecast.py --demo-snapshot
"""

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

from lib.airnow import AirNowClient
from lib.aqi import aqi_band
from lib.diurnal import diurnal_forecast
from lib import open_meteo

DEFAULT_FORECAST_OUT = Path(__file__).parent.parent / "public" / "data" / "aqi-forecast.json"
DEFAULT_WEATHER_OUT = Path(__file__).parent.parent / "public" / "data" / "weather.json"
FIXTURES = Path(__file__).parent / "fixtures"
NYC_TZ = ZoneInfo("America/New_York")
NYC_CITY_CENTROID = (40.7128, -74.0060)  # for one-shot weather pull


def _load_zctas():
    with open(FIXTURES / "nyc_zctas.json") as f:
        return json.load(f)["zctas"]


def _load_overrides():
    with open(FIXTURES / "forecast_overrides.json") as f:
        data = json.load(f)
    return {k: v for k, v in data.items() if not k.startswith("_")}


def _current_aqi_for_zip(client, zcta):
    try:
        sensors = client.current_observations(zip_code=zcta["zip"], distance=10)
    except Exception:
        sensors = []
    if sensors:
        return sensors[0]["aqi"]
    return 80


def _forecast_for_zcta(client, zcta, generated_at, use_open_meteo):
    """Build a 24h forecast curve. Returns (24-int list, source-string)."""
    target_iso = generated_at.strftime("%Y-%m-%dT%H:%M")
    nyc_local_hour = generated_at.astimezone(NYC_TZ).hour

    # Priority 1: Open-Meteo true hourly (CAMS)
    if use_open_meteo:
        meteo_values = open_meteo.hourly_aqi_24h(
            lat=zcta["lat"], lon=zcta["lon"], target_iso_hour=target_iso,
        )
        if meteo_values is not None:
            return meteo_values, "open_meteo_hourly"

    # Priority 2: AirNow daily anchor + diurnal shape
    try:
        anchor = client.forecast_anchor(
            zip_code=zcta["zip"], date=generated_at.date().isoformat()
        )
    except Exception:
        anchor = None

    if anchor is not None:
        return diurnal_forecast(anchor, nyc_local_hour), "airnow_daily_plus_diurnal"

    # Priority 3: current observation + diurnal
    anchor = _current_aqi_for_zip(client, zcta)
    return diurnal_forecast(anchor, nyc_local_hour), "current_obs_plus_diurnal"


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


def build_forecast_payload(client, zctas, overrides, generated_at, use_open_meteo):
    out_zctas = {}
    for z in zctas:
        values, source = _forecast_for_zcta(client, z, generated_at, use_open_meteo)
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


def build_weather_payload(generated_at, use_open_meteo):
    """City-wide hourly weather. NYC weather doesn't vary much across boroughs."""
    if not use_open_meteo:
        return None
    try:
        w = open_meteo.fetch_weather(*NYC_CITY_CENTROID)
    except Exception as e:
        print(f"  warn: weather fetch failed ({e})")
        return None

    target_iso = generated_at.strftime("%Y-%m-%dT%H:%M")
    try:
        i = w["time"].index(target_iso)
    except ValueError:
        return None

    hourly = []
    for offset in range(min(24, len(w["temp_f"]) - i)):
        hourly.append({
            "hour_offset": offset,
            "temp_f": round(w["temp_f"][i + offset], 1),
            "wind_mph": round(w["wind_mph"][i + offset], 1),
            "humidity": round(w["humidity"][i + offset], 0),
        })

    return {
        "schema_version": 1,
        "generated_at": generated_at.isoformat().replace("+00:00", "Z"),
        "source": "Open-Meteo (https://open-meteo.com)",
        "centroid": list(NYC_CITY_CENTROID),
        "hourly": hourly,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_FORECAST_OUT)
    parser.add_argument("--weather-out", type=Path, default=DEFAULT_WEATHER_OUT)
    parser.add_argument("--demo-snapshot", action="store_true",
                        help="Force offline mode — skip both AirNow and Open-Meteo. "
                             "Diurnal-modelled fallback only, plus hand-tuned overrides.")
    args = parser.parse_args()

    if args.demo_snapshot:
        os.environ.pop("AIRNOW_API_KEY", None)
    client = AirNowClient()
    use_open_meteo = not args.demo_snapshot
    print(f"AirNow: {'OFFLINE (fixtures)' if client.is_offline else 'LIVE'}")
    print(f"Open-Meteo: {'ENABLED' if use_open_meteo else 'DISABLED (--demo-snapshot)'}")

    zctas = _load_zctas()
    overrides = _load_overrides()
    generated_at = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)

    payload = build_forecast_payload(client, zctas, overrides, generated_at, use_open_meteo)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(payload, f, separators=(",", ":"))

    sources = {z["source"] for z in payload["zctas"].values()}
    size_kb = args.out.stat().st_size / 1024
    print(f"Wrote {args.out} ({size_kb:.0f} KB) — {len(payload['zctas'])} ZCTAs, sources: {sorted(sources)}")

    weather = build_weather_payload(generated_at, use_open_meteo)
    if weather:
        with open(args.weather_out, "w") as f:
            json.dump(weather, f, separators=(",", ":"))
        size_kb = args.weather_out.stat().st_size / 1024
        print(f"Wrote {args.weather_out} ({size_kb:.0f} KB) — {len(weather['hourly'])} hourly weather points")
    else:
        print("Skipped weather.json (--demo-snapshot or fetch failed)")


if __name__ == "__main__":
    main()
