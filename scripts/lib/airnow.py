"""EPA AirNow API client with offline-fixture fallback.

When AIRNOW_API_KEY is unset, all calls read from `scripts/fixtures/`:
  - airnow_observations.json  (current-AQI sensors)
  - airnow_forecast.json      (per-ZCTA reference 24h shape; anchor = max)

Live calls hit:
  - https://www.airnowapi.org/aq/observation/zipCode/current
  - https://www.airnowapi.org/aq/forecast/zipCode

AirNow's forecast endpoint returns DAILY peak AQI per pollutant per day, NOT
24 hourly values. So `forecast_anchor()` extracts the day's peak AQI; the
within-day shape comes from `lib.diurnal.diurnal_forecast()`.

Free tier: 500 req/hr per key. Client tracks calls and raises RuntimeError
once the safety threshold is reached.
"""

import json
import os
from pathlib import Path

CURRENT_URL = "https://www.airnowapi.org/aq/observation/zipCode/current/"
FORECAST_URL = "https://www.airnowapi.org/aq/forecast/zipCode/"
DEFAULT_RATE_LIMIT = 450  # leave 50 req/hr headroom under AirNow's 500


def _normalize_observation(raw):
    """Map AirNow's live response shape to our internal {lat, lon, aqi, parameter} shape."""
    if "Latitude" in raw:
        return {
            "lat": raw["Latitude"],
            "lon": raw["Longitude"],
            "aqi": int(raw.get("AQI", 0)),
            "parameter": raw.get("ParameterName", "PM2.5"),
        }
    return raw


class AirNowClient:
    def __init__(self, api_key=None, fixture_dir=None, rate_limit=DEFAULT_RATE_LIMIT):
        self.api_key = api_key or os.environ.get("AIRNOW_API_KEY")
        self.fixture_dir = Path(fixture_dir) if fixture_dir else Path(__file__).parent.parent / "fixtures"
        self.rate_limit = rate_limit
        self._call_count = 0
        self._fixtures_cache = {}

    @property
    def is_offline(self):
        return not self.api_key

    def _load_fixture(self, name):
        if name not in self._fixtures_cache:
            with open(self.fixture_dir / name) as f:
                self._fixtures_cache[name] = json.load(f)
        return self._fixtures_cache[name]

    def _check_rate(self):
        self._call_count += 1
        if self._call_count > self.rate_limit:
            raise RuntimeError(
                f"AirNow rate-limit safety threshold ({self.rate_limit}) reached. "
                f"Refusing further calls to protect quota."
            )

    def current_observations(self, zip_code, distance=5):
        """Return a list of {lat, lon, aqi, parameter} dicts near `zip_code`."""
        self._check_rate()
        if self.is_offline:
            data = self._load_fixture("airnow_observations.json")
            return data["sensors"]
        import requests
        params = {
            "format": "application/json",
            "zipCode": zip_code,
            "distance": distance,
            "API_KEY": self.api_key,
        }
        r = requests.get(CURRENT_URL, params=params, timeout=15)
        r.raise_for_status()
        return [_normalize_observation(item) for item in r.json()]

    def forecast_anchor(self, zip_code, date):
        """Return the daily peak AQI (int) forecast for `zip_code` on `date`, or None.

        AirNow's live forecast endpoint returns one entry per pollutant per day.
        We take the max AQI across pollutants for that day as the diurnal anchor.
        """
        self._check_rate()
        if self.is_offline:
            data = self._load_fixture("airnow_forecast.json")
            shape = data.get(zip_code)
            if shape is None or not isinstance(shape, list):
                return None
            return max(shape)
        import requests
        params = {
            "format": "application/json",
            "zipCode": zip_code,
            "date": date,
            "API_KEY": self.api_key,
        }
        r = requests.get(FORECAST_URL, params=params, timeout=15)
        r.raise_for_status()
        rows = r.json()
        same_day = [row for row in rows if row.get("DateForecast") == date]
        if not same_day:
            return None
        return max(int(row.get("AQI", 0)) for row in same_day)
