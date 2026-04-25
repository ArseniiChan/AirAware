from pathlib import Path
import pytest
from lib.airnow import AirNowClient

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures"


class TestOfflineFallback:
    def test_no_api_key_yields_offline_client(self):
        client = AirNowClient(api_key=None, fixture_dir=FIXTURE_DIR)
        assert client.is_offline is True

    def test_offline_current_observations_returns_fixture_sensors(self):
        client = AirNowClient(api_key=None, fixture_dir=FIXTURE_DIR)
        sensors = client.current_observations(zip_code="10454")
        assert len(sensors) >= 1
        first = sensors[0]
        assert "lat" in first and "lon" in first and "aqi" in first

    def test_offline_returns_all_sensors_regardless_of_zip(self):
        # Offline mode is for demo prep, not real geo filtering — return everything.
        client = AirNowClient(api_key=None, fixture_dir=FIXTURE_DIR)
        a = client.current_observations(zip_code="10454")
        b = client.current_observations(zip_code="10024")
        assert a == b

    def test_offline_forecast_returns_24_hourly_values(self):
        client = AirNowClient(api_key=None, fixture_dir=FIXTURE_DIR)
        hourly = client.forecast(zip_code="10024", date="2026-04-25")
        assert len(hourly) == 24
        assert all(isinstance(v, int) for v in hourly)

    def test_offline_forecast_for_unknown_zip_returns_none(self):
        # Hero ZIPs (10454/10474) intentionally not in fixture so the diurnal
        # fallback runs — None signals "not available, use fallback".
        client = AirNowClient(api_key=None, fixture_dir=FIXTURE_DIR)
        assert client.forecast(zip_code="10454", date="2026-04-25") is None


class TestRateLimitGuard:
    def test_safety_threshold_refuses_after_limit(self):
        client = AirNowClient(api_key=None, fixture_dir=FIXTURE_DIR, rate_limit=3)
        client.current_observations(zip_code="10024")
        client.current_observations(zip_code="10024")
        client.current_observations(zip_code="10024")
        with pytest.raises(RuntimeError):
            client.current_observations(zip_code="10024")
