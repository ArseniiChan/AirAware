"""PurpleAir client with offline-fixture fallback.

PurpleAir requires a free read-only API key (email contact@purpleair.com,
or sign up at https://develop.purpleair.com/keys). When PURPLEAIR_API_KEY
is unset, all calls read from `scripts/fixtures/purpleair_sensors.json`.

PurpleAir's NYC density is the densest of any free sensor network — community-
deployed indoor and outdoor PA-II sensors. We use the `pm2.5_atm` field
(particulates, atmospheric calibration) and convert to US-AQI using the
EPA's PM2.5 → AQI formula.
"""

import json
import os
from pathlib import Path

SENSORS_URL = "https://api.purpleair.com/v1/sensors"

# EPA AQI breakpoints for PM2.5 (24-hour average, µg/m³)
# https://www.airnow.gov/aqi/aqi-calculator-concentration/
_PM25_BREAKS = [
    (0.0, 12.0, 0, 50),
    (12.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 150.4, 151, 200),
    (150.5, 250.4, 201, 300),
    (250.5, 500.4, 301, 500),
]


def pm25_to_aqi(pm):
    """EPA PM2.5 (µg/m³) → US AQI (0–500). Linear within breakpoint segments."""
    if pm is None or pm < 0:
        return None
    pm = round(pm, 1)
    for c_lo, c_hi, i_lo, i_hi in _PM25_BREAKS:
        if c_lo <= pm <= c_hi:
            return int(round((i_hi - i_lo) / (c_hi - c_lo) * (pm - c_lo) + i_lo))
    return 500


def _normalize_purpleair_row(row, header):
    """PurpleAir's v1 API returns rows as parallel arrays keyed by `fields`."""
    rec = dict(zip(header, row))
    if "lat" in rec:  # already normalized
        return rec
    pm = rec.get("pm2.5_atm")
    if pm is None:
        return None
    aqi = pm25_to_aqi(pm)
    if aqi is None:
        return None
    lat = rec.get("latitude")
    lon = rec.get("longitude")
    if lat is None or lon is None:
        return None
    return {"lat": float(lat), "lon": float(lon), "aqi": aqi, "parameter": "PM2.5"}


class PurpleAirClient:
    def __init__(self, api_key=None, fixture_dir=None, rate_limit=200):
        self.api_key = api_key or os.environ.get("PURPLEAIR_API_KEY")
        self.fixture_dir = Path(fixture_dir) if fixture_dir else Path(__file__).parent.parent / "fixtures"
        self.rate_limit = rate_limit
        self._call_count = 0
        self._fixture = None

    @property
    def is_offline(self):
        return not self.api_key

    def _load_fixture(self):
        if self._fixture is None:
            with open(self.fixture_dir / "purpleair_sensors.json") as f:
                self._fixture = json.load(f)
        return self._fixture

    def _check_rate(self):
        self._call_count += 1
        if self._call_count > self.rate_limit:
            raise RuntimeError(f"PurpleAir rate-limit safety threshold ({self.rate_limit}) reached.")

    def sensors_in_bbox(self, bbox):
        """bbox = (min_lon, min_lat, max_lon, max_lat). Returns normalized sensors."""
        self._check_rate()
        min_lon, min_lat, max_lon, max_lat = bbox

        if self.is_offline:
            data = self._load_fixture()
            return [
                s for s in data["sensors"]
                if min_lon <= s["lon"] <= max_lon and min_lat <= s["lat"] <= max_lat
            ]

        import requests
        params = {
            "fields": "latitude,longitude,pm2.5_atm",
            "nwlng": min_lon, "nwlat": max_lat,
            "selng": max_lon, "selat": min_lat,
            "location_type": 0,  # 0 = outdoor only
            "max_age": 3600,     # only sensors reporting in the last hour
        }
        headers = {"X-API-Key": self.api_key}
        r = requests.get(SENSORS_URL, params=params, headers=headers, timeout=15)
        r.raise_for_status()
        body = r.json()
        header = body.get("fields", [])
        rows = body.get("data", [])
        out = []
        for row in rows:
            n = _normalize_purpleair_row(row, header)
            if n is None:
                continue
            out.append(n)
        return out
