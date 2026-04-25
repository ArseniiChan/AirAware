import pytest
from lib.open_meteo import _align_hourly_to_target, _has_nulls


def _times(start_hour=0, count=48):
    """Build a list of ISO timestamps like Open-Meteo returns: '2026-04-25T03:00'."""
    return [f"2026-04-25T{(start_hour + i) % 24:02d}:00" if i < 24
            else f"2026-04-26T{(start_hour + i) % 24:02d}:00"
            for i in range(count)]


class TestAlignHourly:
    def test_happy_path_returns_24_values(self):
        times = _times()
        values = list(range(48))
        out = _align_hourly_to_target(times, values, "2026-04-25T00:00")
        assert out == list(range(24))

    def test_aligns_to_mid_window(self):
        times = _times()
        values = list(range(48))
        out = _align_hourly_to_target(times, values, "2026-04-25T05:00")
        assert out == list(range(5, 29))

    def test_raises_when_target_not_present(self):
        times = _times()
        values = list(range(48))
        with pytest.raises(ValueError):
            _align_hourly_to_target(times, values, "2026-04-30T00:00")

    def test_raises_when_insufficient_window_after_target(self):
        times = _times()
        values = list(range(48))
        # only 5 hours of data left after this target
        with pytest.raises(ValueError):
            _align_hourly_to_target(times, values, "2026-04-26T19:00")


class TestHasNulls:
    def test_returns_false_for_clean_array(self):
        assert _has_nulls([1, 2, 3]) is False

    def test_returns_true_when_any_null(self):
        assert _has_nulls([1, None, 3]) is True
