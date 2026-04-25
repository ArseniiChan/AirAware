import pytest
from lib.no2_boost import (
    distance_to_segment_m,
    boost_for_point,
    apply_highway_boost,
)

# A simple east-west segment along lat = 40.8
EAST_WEST = [(-73.92, 40.80), (-73.88, 40.80)]
HIGHWAYS_FIXTURE = [
    {"name": "Test Hwy", "boost": 30, "vertices": EAST_WEST},
]


class TestDistanceToSegment:
    def test_point_on_segment_is_zero(self):
        d = distance_to_segment_m((40.80, -73.90), EAST_WEST[0], EAST_WEST[1])
        assert d == pytest.approx(0, abs=1)

    def test_point_50m_north_is_about_50m(self):
        # 50m north of segment midpoint
        d = distance_to_segment_m((40.80045, -73.90), EAST_WEST[0], EAST_WEST[1])
        assert 40 < d < 60

    def test_point_far_from_segment(self):
        d = distance_to_segment_m((40.85, -73.90), EAST_WEST[0], EAST_WEST[1])
        assert d > 5000


class TestBoostForPoint:
    def test_within_50m_returns_full_boost(self):
        b = boost_for_point((40.80, -73.90), HIGHWAYS_FIXTURE, falloff_m=50)
        assert b == 30

    def test_at_falloff_boundary_is_zero(self):
        # ~150m away with 50m falloff → 0
        b = boost_for_point((40.8014, -73.90), HIGHWAYS_FIXTURE, falloff_m=50)
        assert b == 0

    def test_within_falloff_window_is_partial(self):
        # ~75m north — between 50m core and 50+50=100m boundary → ~half
        b = boost_for_point((40.80067, -73.90), HIGHWAYS_FIXTURE, falloff_m=50)
        assert 5 < b < 30

    def test_no_highways_means_no_boost(self):
        assert boost_for_point((40.80, -73.90), [], falloff_m=50) == 0


class TestApplyHighwayBoost:
    def test_clamps_to_500(self):
        cells = [{"lat": 40.80, "lon": -73.90, "aqi": 480, "band": "very-unhealthy", "dominant_pollutant": "PM2.5"}]
        out = apply_highway_boost(cells, HIGHWAYS_FIXTURE)
        assert out[0]["aqi"] == 500

    def test_far_cells_unchanged(self):
        cells = [{"lat": 40.85, "lon": -73.90, "aqi": 50, "band": "good", "dominant_pollutant": "PM2.5"}]
        out = apply_highway_boost(cells, HIGHWAYS_FIXTURE)
        assert out[0]["aqi"] == 50

    def test_near_cells_get_boosted_and_band_updated(self):
        cells = [{"lat": 40.80, "lon": -73.90, "aqi": 80, "band": "moderate", "dominant_pollutant": "PM2.5"}]
        out = apply_highway_boost(cells, HIGHWAYS_FIXTURE)
        assert out[0]["aqi"] == 110
        assert out[0]["band"] == "sensitive"
        assert out[0]["dominant_pollutant"] == "NO2"
