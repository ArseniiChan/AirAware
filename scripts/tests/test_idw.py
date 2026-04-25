import pytest
from lib.idw import idw


class TestIdwHappyPath:
    def test_single_sensor_returns_its_value(self):
        sensors = [(40.7, -74.0, 80)]
        target = (40.71, -74.01)
        assert idw(sensors, target) == 80

    def test_coincident_sensor_returns_its_value(self):
        sensors = [(40.7, -74.0, 80), (40.8, -73.9, 200)]
        target = (40.7, -74.0)
        assert idw(sensors, target) == 80

    def test_midpoint_between_two_equal_distance_sensors(self):
        sensors = [(40.70, -74.0, 100), (40.72, -74.0, 200)]
        target = (40.71, -74.0)  # exact midpoint
        # IDW with power=2 weights both equally → average = 150
        result = idw(sensors, target)
        assert 145 <= result <= 155


class TestIdwInvalid:
    def test_empty_sensors_raises(self):
        with pytest.raises(ValueError):
            idw([], (40.7, -74.0))


class TestIdwBehavior:
    def test_closer_sensor_dominates(self):
        sensors = [
            (40.70, -74.00, 50),     # close to target
            (40.95, -73.50, 200),    # far from target
        ]
        target = (40.705, -74.005)
        # Result should be much closer to 50 than to 200.
        result = idw(sensors, target)
        assert result < 100
