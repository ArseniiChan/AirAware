import pytest
from lib.grid import generate_grid, haversine_m

NYC_BBOX = (-74.27, 40.49, -73.68, 40.92)


class TestGenerateGridShape:
    def test_returns_list_of_lat_lon_tuples(self):
        cells = generate_grid(NYC_BBOX, spacing_m=200)
        assert all(len(c) == 2 for c in cells)
        for lat, lon in cells[:5]:
            assert -90 <= lat <= 90
            assert -180 <= lon <= 180

    def test_default_nyc_cell_count_in_range(self):
        cells = generate_grid(NYC_BBOX, spacing_m=200)
        assert 30000 < len(cells) < 80000

    def test_coarser_spacing_yields_fewer_cells(self):
        fine = generate_grid(NYC_BBOX, spacing_m=200)
        coarse = generate_grid(NYC_BBOX, spacing_m=1000)
        assert len(coarse) < len(fine)


class TestGenerateGridSpacing:
    def test_neighbour_spacing_within_tolerance(self):
        cells = generate_grid(NYC_BBOX, spacing_m=200)
        # Adjacent cells in the same row should be ~200m apart in lon.
        # Find two cells with the same lat and adjacent lons.
        first = cells[0]
        same_lat = [c for c in cells if c[0] == first[0]]
        assert len(same_lat) >= 2
        d = haversine_m(same_lat[0], same_lat[1])
        assert 180 <= d <= 220


class TestGenerateGridEdgeCases:
    def test_inverted_bbox_raises(self):
        with pytest.raises(ValueError):
            generate_grid((-73.68, 40.92, -74.27, 40.49), spacing_m=200)

    def test_zero_spacing_raises(self):
        with pytest.raises(ValueError):
            generate_grid(NYC_BBOX, spacing_m=0)


class TestHaversine:
    def test_zero_distance_for_same_point(self):
        assert haversine_m((40.7, -74.0), (40.7, -74.0)) == pytest.approx(0, abs=0.01)

    def test_known_short_distance(self):
        # 1° latitude ≈ 111.32 km
        d = haversine_m((40.0, -74.0), (41.0, -74.0))
        assert 110000 < d < 112000
