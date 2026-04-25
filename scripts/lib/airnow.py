"""EPA AirNow API client with offline-fixture fallback.

When AIRNOW_API_KEY is unset, all calls read from `scripts/fixtures/`:
  - airnow_observations.json  (current-AQI sensors)
  - airnow_forecast.json      (per-ZCTA 24h forecasts)

Live calls hit:
  - https://www.airnowapi.org/aq/observation/zipCode/current
  - https://www.airnowapi.org/aq/forecast/zipCode

Free tier: 500 req/hr per key. Client tracks calls and raises RuntimeError
once the safety threshold is reached, so a runaway batch script can't burn
the team's quota in the middle of the demo.
"""

import json
import os
from pathlib import Path

CURRENT_URL = "https://www.airnowapi.org/aq/observation/zipCode/current/"
FORECAST_URL = "https://www.airnowapi.org/aq/forecast/zipCode/"
DEFAULT_RATE_LIMIT = 450  # leave 50 req/hr headroom under AirNow's 500


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
        self._check_rate()
        if self.is_offline:
            data = self._load_fixture("airnow_observations.json")
            return data["sensors"]
        # Live path — kept simple; ingest scripts handle errors at the call site.
        import requests
        params = {
            "format": "application/json",
            "zipCode": zip_code,
            "distance": distance,
            "API_KEY": self.api_key,
        }
        r = requests.get(CURRENT_URL, params=params, timeout=15)
        r.raise_for_status()
        return r.json()

    def forecast(self, zip_code, date):
        self._check_rate()
        if self.is_offline:
            data = self._load_fixture("airnow_forecast.json")
            return data.get(zip_code)  # None if not present → caller falls back
        import requests
        params = {
            "format": "application/json",
            "zipCode": zip_code,
            "date": date,
            "API_KEY": self.api_key,
        }
        r = requests.get(FORECAST_URL, params=params, timeout=15)
        r.raise_for_status()
        return r.json()
