import pytest
from lib.diurnal import diurnal_forecast


class TestDiurnalForecastShape:
    def test_returns_24_values(self):
        result = diurnal_forecast(current_aqi=100, current_hour=12)
        assert len(result) == 24

    def test_returns_integers(self):
        result = diurnal_forecast(current_aqi=100, current_hour=12)
        assert all(isinstance(v, int) for v in result)

    def test_first_value_is_close_to_current(self):
        # The 0th forecast hour represents "right now"; should be near current.
        result = diurnal_forecast(current_aqi=100, current_hour=12)
        assert abs(result[0] - 100) <= 10


class TestDiurnalForecastBounds:
    def test_values_stay_within_40_percent_band(self):
        current = 100
        result = diurnal_forecast(current_aqi=current, current_hour=8)
        for v in result:
            assert v >= int(current * 0.6) - 1
            assert v <= int(current * 1.4) + 1

    def test_no_negative_values(self):
        result = diurnal_forecast(current_aqi=10, current_hour=12)
        assert all(v >= 0 for v in result)


class TestDiurnalForecastPattern:
    def test_morning_rush_higher_than_afternoon_trough(self):
        # Anchor at midnight; the curve should peak in the morning rush
        # (7-9 local) and dip in the afternoon (14-16 local).
        result = diurnal_forecast(current_aqi=100, current_hour=0)
        morning_peak = max(result[7], result[8], result[9])
        afternoon_trough = min(result[14], result[15], result[16])
        assert morning_peak > afternoon_trough

    def test_deterministic(self):
        a = diurnal_forecast(current_aqi=120, current_hour=10)
        b = diurnal_forecast(current_aqi=120, current_hour=10)
        assert a == b


class TestDiurnalForecastInvalid:
    def test_negative_aqi_raises(self):
        with pytest.raises(ValueError):
            diurnal_forecast(current_aqi=-1, current_hour=12)

    def test_hour_out_of_range_raises(self):
        with pytest.raises(ValueError):
            diurnal_forecast(current_aqi=100, current_hour=24)
        with pytest.raises(ValueError):
            diurnal_forecast(current_aqi=100, current_hour=-1)
