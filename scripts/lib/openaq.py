"""OpenAQ v3 client with offline-fixture fallback.

OpenAQ v3 API requires an API key (free signup at https://explore.openaq.org/).
When OPENAQ_API_KEY is unset, all calls read from
`scripts/fixtures/openaq_locations.json`.

OpenAQ converts raw measurements (PM2.5 µg/m³, NO2 ppb, etc.) to a global
schema. Our fixture stores already-derived US-AQI integers so the merge with
AirNow + PurpleAir is consistent.
"""

import json
import os
from pathlib import Path

LOCATIONS_URL = "https://api.openaq.org/v3/locations"
LOCATION_LATEST_URL = "https://api.openaq.org/v3/locations/{id}/latest"

# OpenAQ v3 reports concentrations in native units. We convert to US AQI for
# the merged sensor pool. PM2.5 → AQI uses the same EPA breakpoints as PurpleAir;
# import that to avoid duplication.
from .purpleair import pm25_to_aqi


def _ozone_ppb_to_aqi(value_ppb):
    """EPA O3 (ppb, 8-hour avg) → US AQI. Simplified linear segments."""
    if value_ppb is None or value_ppb < 0:
        return None
    breaks = [
        (0, 54, 0, 50),
        (55, 70, 51, 100),
        (71, 85, 101, 150),
        (86, 105, 151, 200),
        (106, 200, 201, 300),
    ]
    for c_lo, c_hi, i_lo, i_hi in breaks:
        if c_lo <= value_ppb <= c_hi:
            return int(round((i_hi - i_lo) / (c_hi - c_lo) * (value_ppb - c_lo) + i_lo))
    return 300


def _no2_ppb_to_aqi(value_ppb):
    """EPA NO2 (ppb, 1-hour) → US AQI."""
    if value_ppb is None or value_ppb < 0:
        return None
    breaks = [
        (0, 53, 0, 50),
        (54, 100, 51, 100),
        (101, 360, 101, 150),
        (361, 649, 151, 200),
        (650, 1249, 201, 300),
    ]
    for c_lo, c_hi, i_lo, i_hi in breaks:
        if c_lo <= value_ppb <= c_hi:
            return int(round((i_hi - i_lo) / (c_hi - c_lo) * (value_ppb - c_lo) + i_lo))
    return 300


def _concentration_to_aqi(value, units, parameter_name):
    """Best-effort conversion. PM2.5 µg/m³, NO2 ppb, O3 ppb supported.
    Returns None if we can't confidently convert (caller skips that sensor).
    """
    pname = (parameter_name or "").lower()
    units = (units or "").lower()
    if pname in {"pm25", "pm2.5"} and units in {"µg/m³", "ug/m3", "µg/m3"}:
        return pm25_to_aqi(value), "PM2.5"
    if pname == "no2" and units in {"ppb", "ppbv"}:
        return _no2_ppb_to_aqi(value), "NO2"
    if pname == "o3" and units in {"ppb", "ppbv"}:
        return _ozone_ppb_to_aqi(value), "OZONE"
    if pname == "o3" and units == "ppm":
        return _ozone_ppb_to_aqi(value * 1000), "OZONE"
    return None, None


class OpenAQClient:
    def __init__(self, api_key=None, fixture_dir=None, rate_limit=300):
        self.api_key = api_key or os.environ.get("OPENAQ_API_KEY")
        self.fixture_dir = Path(fixture_dir) if fixture_dir else Path(__file__).parent.parent / "fixtures"
        self.rate_limit = rate_limit
        self._call_count = 0
        self._fixture = None

    @property
    def is_offline(self):
        return not self.api_key

    def _load_fixture(self):
        if self._fixture is None:
            with open(self.fixture_dir / "openaq_locations.json") as f:
                self._fixture = json.load(f)
        return self._fixture

    def _check_rate(self):
        self._call_count += 1
        if self._call_count > self.rate_limit:
            raise RuntimeError(f"OpenAQ rate-limit safety threshold ({self.rate_limit}) reached.")

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
        # OpenAQ v3 wants a center+radius; pick the bbox center and a radius
        # that covers all 5 boroughs (~25km).
        center_lat = (min_lat + max_lat) / 2
        center_lon = (min_lon + max_lon) / 2
        params = {
            "coordinates": f"{center_lat},{center_lon}",
            "radius": 25_000,
            "limit": 100,
        }
        headers = {"X-API-Key": self.api_key}
        r = requests.get(LOCATIONS_URL, params=params, headers=headers, timeout=15)
        r.raise_for_status()
        locations = r.json().get("results", [])

        # Filter to the bbox client-side; OpenAQ's radius can spill outside.
        in_bbox = [
            loc for loc in locations
            if (loc.get("coordinates") and
                min_lon <= loc["coordinates"]["longitude"] <= max_lon and
                min_lat <= loc["coordinates"]["latitude"] <= max_lat)
        ]

        # OpenAQ v3 separates location metadata from latest values. Fetch the
        # /latest endpoint per location. Cap at ~30 locations to stay polite.
        out = []
        for loc in in_bbox[:30]:
            self._check_rate()
            try:
                lr = requests.get(
                    LOCATION_LATEST_URL.format(id=loc["id"]),
                    headers=headers, timeout=10,
                )
                lr.raise_for_status()
                latest_records = lr.json().get("results", [])
            except Exception:
                continue

            # Index sensor metadata by sensor id so we can look up units + parameter
            sensor_meta = {s["id"]: s for s in loc.get("sensors", []) if s.get("id")}

            # Pick the worst (highest AQI) reading at this location across all sensors
            best = None
            for rec in latest_records:
                sid = rec.get("sensorsId")
                meta = sensor_meta.get(sid)
                if not meta:
                    continue
                value = rec.get("value")
                param_obj = meta.get("parameter") or {}
                aqi, param_label = _concentration_to_aqi(
                    value, param_obj.get("units"), param_obj.get("name"),
                )
                if aqi is None:
                    continue
                if best is None or aqi > best["aqi"]:
                    best = {"aqi": aqi, "parameter": param_label}
            if best is None:
                continue
            coords = loc["coordinates"]
            out.append({
                "lat": float(coords["latitude"]),
                "lon": float(coords["longitude"]),
                "aqi": best["aqi"],
                "parameter": best["parameter"],
            })
        return out
