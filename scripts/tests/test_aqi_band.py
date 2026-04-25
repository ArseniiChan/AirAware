import pytest
from lib.aqi import aqi_band


class TestAqiBandHappyPath:
    def test_zero_is_good(self):
        assert aqi_band(0) == "good"

    def test_fifty_is_good_upper_boundary(self):
        assert aqi_band(50) == "good"

    def test_fifty_one_is_moderate_lower_boundary(self):
        assert aqi_band(51) == "moderate"

    def test_one_hundred_is_moderate_upper_boundary(self):
        assert aqi_band(100) == "moderate"

    def test_one_oh_one_is_sensitive_lower_boundary(self):
        assert aqi_band(101) == "sensitive"

    def test_one_fifty_is_sensitive_upper_boundary(self):
        assert aqi_band(150) == "sensitive"

    def test_one_fifty_one_is_unhealthy_lower_boundary(self):
        assert aqi_band(151) == "unhealthy"

    def test_two_hundred_is_unhealthy_upper_boundary(self):
        assert aqi_band(200) == "unhealthy"

    def test_two_oh_one_is_very_unhealthy_lower_boundary(self):
        assert aqi_band(201) == "very-unhealthy"

    def test_three_hundred_is_very_unhealthy_upper_boundary(self):
        assert aqi_band(300) == "very-unhealthy"

    def test_three_oh_one_is_hazardous_lower_boundary(self):
        assert aqi_band(301) == "hazardous"

    def test_five_hundred_is_hazardous(self):
        assert aqi_band(500) == "hazardous"


class TestAqiBandInvalidInput:
    def test_negative_raises_value_error(self):
        with pytest.raises(ValueError):
            aqi_band(-1)

    def test_none_raises_value_error(self):
        with pytest.raises(ValueError):
            aqi_band(None)
