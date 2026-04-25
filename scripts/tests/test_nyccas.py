from pathlib import Path
from lib.nyccas import NYCCASClient

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures"


def test_returns_two_sensors_per_site():
    """One PM2.5 + one NO2 record per fixture site."""
    client = NYCCASClient(fixture_dir=FIXTURE_DIR)
    all_nyc = client.sensors_in_bbox((-74.27, 40.49, -73.68, 40.92))
    pm = [s for s in all_nyc if s["parameter"] == "PM2.5"]
    no2 = [s for s in all_nyc if s["parameter"] == "NO2"]
    assert len(pm) >= 25
    assert len(no2) >= 25
    assert len(pm) == len(no2)  # one of each per site


def test_filters_by_bbox():
    client = NYCCASClient(fixture_dir=FIXTURE_DIR)
    bronx = client.sensors_in_bbox((-73.95, 40.80, -73.85, 40.90))
    for s in bronx:
        assert -73.95 <= s["lon"] <= -73.85
        assert 40.80 <= s["lat"] <= 40.90


def test_aqi_in_reasonable_range():
    """NYCCAS values are annual averages — should be moderate band, not extremes."""
    client = NYCCASClient(fixture_dir=FIXTURE_DIR)
    all_nyc = client.sensors_in_bbox((-74.27, 40.49, -73.68, 40.92))
    for s in all_nyc:
        assert 0 <= s["aqi"] <= 100  # annual averages don't reach unhealthy


def test_records_carry_source_label():
    client = NYCCASClient(fixture_dir=FIXTURE_DIR)
    sensors = client.sensors_in_bbox((-74.27, 40.49, -73.68, 40.92))
    assert all(s.get("source") == "NYCCAS" for s in sensors)
