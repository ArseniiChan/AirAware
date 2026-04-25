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

    def test_offline_forecast_anchor_returns_int_for_known_zip(self):
        client = AirNowClient(api_key=None, fixture_dir=FIXTURE_DIR)
        anchor = client.forecast_anchor(zip_code="10024", date="2026-04-25")
        assert isinstance(anchor, int)
        assert 0 < anchor < 500

    def test_offline_forecast_anchor_uses_daily_peak(self):
        # The fixture for 10024 has a 24h shape; the anchor should be the max.
        client = AirNowClient(api_key=None, fixture_dir=FIXTURE_DIR)
        anchor = client.forecast_anchor(zip_code="10024", date="2026-04-25")
        # Fixture's 10024 peaks at 98 (morning rush)
        assert anchor == 98

    def test_offline_forecast_anchor_for_unknown_zip_returns_none(self):
        # Hero ZIPs (10454/10474) intentionally absent → None signals fallback.
        client = AirNowClient(api_key=None, fixture_dir=FIXTURE_DIR)
        assert client.forecast_anchor(zip_code="10454", date="2026-04-25") is None


class TestNormalization:
    def test_live_shape_normalized_to_lat_lon_aqi(self):
        # Simulate AirNow's live response shape: capitalized field names.
        from lib.airnow import _normalize_observation
        live_record = {
            "DateObserved": "2026-04-25",
            "Latitude": 40.8419,
            "Longitude": -73.8359,
            "ParameterName": "PM2.5",
            "AQI": 87,
            "Category": {"Name": "Moderate"},
        }
        result = _normalize_observation(live_record)
        assert result["lat"] == 40.8419
        assert result["lon"] == -73.8359
        assert result["aqi"] == 87
        assert result["parameter"] == "PM2.5"

    def test_fixture_shape_passes_through_unchanged(self):
        from lib.airnow import _normalize_observation
        fixture_record = {"lat": 40.7, "lon": -74.0, "aqi": 50, "parameter": "O3"}
        assert _normalize_observation(fixture_record) == fixture_record


class TestRateLimitGuard:
    def test_safety_threshold_refuses_after_limit(self):
        client = AirNowClient(api_key=None, fixture_dir=FIXTURE_DIR, rate_limit=3)
        client.current_observations(zip_code="10024")
        client.current_observations(zip_code="10024")
        client.current_observations(zip_code="10024")
        with pytest.raises(RuntimeError):
            client.current_observations(zip_code="10024")
