from pathlib import Path
from lib.openaq import OpenAQClient

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures"


class TestOfflineFallback:
    def test_no_api_key_yields_offline_client(self):
        client = OpenAQClient(api_key=None, fixture_dir=FIXTURE_DIR)
        assert client.is_offline is True

    def test_offline_returns_normalized_sensors(self):
        client = OpenAQClient(api_key=None, fixture_dir=FIXTURE_DIR)
        sensors = client.sensors_in_bbox((-74.27, 40.49, -73.68, 40.92))
        assert len(sensors) >= 1
        first = sensors[0]
        assert {"lat", "lon", "aqi", "parameter"}.issubset(first.keys())

    def test_offline_filters_by_bbox(self):
        client = OpenAQClient(api_key=None, fixture_dir=FIXTURE_DIR)
        # Tiny bbox over the Hunts Point cluster
        only_bronx = client.sensors_in_bbox((-73.91, 40.80, -73.87, 40.84))
        all_nyc = client.sensors_in_bbox((-74.27, 40.49, -73.68, 40.92))
        assert len(only_bronx) < len(all_nyc)
        for s in only_bronx:
            assert -73.91 <= s["lon"] <= -73.87
            assert 40.80 <= s["lat"] <= 40.84
