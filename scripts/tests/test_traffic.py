import pytest
from lib.traffic import hourly_factor, PROFILES


class TestHourlyFactor:
    def test_peak_hour_is_full(self):
        # 8am is the morning rush peak in both profiles
        assert hourly_factor(8, "commuter") == 1.0
        # always_busy peak is at 5pm (17)
        assert hourly_factor(17, "always_busy") == 1.0

    def test_overnight_trough_is_lower_than_peak(self):
        for prof in ("commuter", "always_busy"):
            assert hourly_factor(3, prof) < hourly_factor(8, prof)

    def test_always_busy_floor_higher_than_commuter(self):
        # 3am: always-busy roads still have substantial traffic, commuter
        # arteries are nearly empty.
        assert hourly_factor(3, "always_busy") > hourly_factor(3, "commuter")

    def test_all_values_in_unit_interval(self):
        for prof in PROFILES:
            for h in range(24):
                v = hourly_factor(h, prof)
                assert 0.0 <= v <= 1.0


class TestInvalidInput:
    def test_negative_hour_raises(self):
        with pytest.raises(ValueError):
            hourly_factor(-1)

    def test_24_raises(self):
        with pytest.raises(ValueError):
            hourly_factor(24)

    def test_unknown_profile_falls_back(self):
        # Unknown profile silently uses the default; doesn't raise.
        result = hourly_factor(8, "no_such_profile")
        assert 0.0 <= result <= 1.0
