"""Open-Meteo client — keyless hourly air quality + weather forecasts.

Two endpoints we use, both free, no key required:
  - https://air-quality-api.open-meteo.com/v1/air-quality
      hourly=us_aqi (CAMS-derived US AQI scale)
  - https://api.open-meteo.com/v1/forecast
      hourly=temperature_2m,wind_speed_10m,relative_humidity_2m

Why Open-Meteo over EPA AirNow's forecast endpoint: AirNow only publishes
DAILY peak AQI, not hourly. Open-Meteo gives 24+ true hourly values, which
the time-scrubber needs. AirNow remains useful for current observations
(more locally calibrated than CAMS) and as a daily anchor cross-check.
"""

AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"


def _has_nulls(values):
    return any(v is None for v in values)


def _align_hourly_to_target(times, values, target_iso_hour):
    """Return 24 consecutive values starting at the index where times == target_iso_hour."""
    try:
        i = times.index(target_iso_hour)
    except ValueError:
        raise ValueError(f"target {target_iso_hour!r} not present in hourly times")
    if len(values) - i < 24:
        raise ValueError(
            f"only {len(values) - i} hours available after {target_iso_hour}, need 24"
        )
    return values[i : i + 24]


def fetch_air_quality(lat, lon):
    """Live call. Returns dict with keys 'time' (list[str]) and 'us_aqi' (list[int|None])."""
    import requests
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "us_aqi",
        "forecast_days": 2,
    }
    r = requests.get(AIR_QUALITY_URL, params=params, timeout=15)
    r.raise_for_status()
    return r.json()["hourly"]


def fetch_weather(lat, lon):
    """Live call. Returns dict with hourly temp_f / wind_mph / humidity arrays + time."""
    import requests
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m,wind_speed_10m,relative_humidity_2m",
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "forecast_days": 2,
    }
    r = requests.get(WEATHER_URL, params=params, timeout=15)
    r.raise_for_status()
    h = r.json()["hourly"]
    return {
        "time": h["time"],
        "temp_f": h["temperature_2m"],
        "wind_mph": h["wind_speed_10m"],
        "humidity": h["relative_humidity_2m"],
    }


def hourly_aqi_24h(lat, lon, target_iso_hour):
    """Return 24 hourly AQI values starting at target_iso_hour, or None if Open-Meteo
    has nulls in the window or the target hour isn't present."""
    try:
        h = fetch_air_quality(lat, lon)
    except Exception:
        return None
    try:
        window = _align_hourly_to_target(h["time"], h["us_aqi"], target_iso_hour)
    except ValueError:
        return None
    if _has_nulls(window):
        return None
    return [int(v) for v in window]
