from pathlib import Path
import pytest
from lib.tempo import TempoClient, column_to_aqi

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures"


class TestColumnToAqi:
    def test_zero_is_aqi_zero(self):
        assert column_to_aqi(0) == 0

    def test_typical_clean_column_is_low_aqi(self):
        # 4×10^15 → ~6 ppb → ~6 AQI (good)
        assert column_to_aqi(4) < 25

    def test_industrial_column_reaches_moderate_aqi(self):
        # 14×10^15 → ~21 ppb → ~20 AQI (still good for NO2 1-hr scale)
        # NO2's good band is 0-53 ppb, so 21 ppb is still well within good.
        result = column_to_aqi(14)
        assert 15 < result < 60

    def test_negative_returns_none(self):
        assert column_to_aqi(-1) is None


class TestTempoClient:
    def test_returns_pixels_in_bbox(self):
        client = TempoClient(fixture_dir=FIXTURE_DIR)
        all_nyc = client.sensors_in_bbox((-74.27, 40.49, -73.68, 40.92))
        assert len(all_nyc) >= 5

    def test_records_have_source_tempo(self):
        client = TempoClient(fixture_dir=FIXTURE_DIR)
        all_nyc = client.sensors_in_bbox((-74.27, 40.49, -73.68, 40.92))
        assert all(p.get("source") == "TEMPO" for p in all_nyc)

    def test_filters_by_bbox(self):
        client = TempoClient(fixture_dir=FIXTURE_DIR)
        bronx_only = client.sensors_in_bbox((-73.95, 40.80, -73.85, 40.90))
        for p in bronx_only:
            assert -73.95 <= p["lon"] <= -73.85
            assert 40.80 <= p["lat"] <= 40.90
