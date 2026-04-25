from pathlib import Path
from lib.purpleair import PurpleAirClient

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures"


class TestOfflineFallback:
    def test_no_api_key_yields_offline_client(self):
        client = PurpleAirClient(api_key=None, fixture_dir=FIXTURE_DIR)
        assert client.is_offline is True

    def test_offline_returns_normalized_sensors(self):
        client = PurpleAirClient(api_key=None, fixture_dir=FIXTURE_DIR)
        sensors = client.sensors_in_bbox((-74.27, 40.49, -73.68, 40.92))
        assert len(sensors) >= 10
        for s in sensors[:3]:
            assert {"lat", "lon", "aqi", "parameter"}.issubset(s.keys())

    def test_offline_filters_by_bbox(self):
        client = PurpleAirClient(api_key=None, fixture_dir=FIXTURE_DIR)
        bronx_only = client.sensors_in_bbox((-73.92, 40.80, -73.86, 40.86))
        for s in bronx_only:
            assert -73.92 <= s["lon"] <= -73.86
            assert 40.80 <= s["lat"] <= 40.86
