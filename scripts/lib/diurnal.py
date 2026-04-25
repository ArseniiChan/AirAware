"""Diurnal-pattern AQI forecast fallback.

When EPA AirNow returns no forecast for a NYC ZCTA, generate a 24h curve
anchored on the most recent observation. The curve has a morning rush peak
(7–9am) and an afternoon trough (2–4pm) — matching the demo beat where
Maya's verdict flips from STAY_INSIDE to WALK at 4pm.
"""

import math

# Per-hour multiplier (NYC local time). 1.0 = no change vs anchor.
# Morning rush: 7-9am peaks at ~1.25x. Afternoon trough: 2-4pm dips to ~0.78x.
_HOUR_MULTIPLIERS = [
    0.90, 0.85, 0.82, 0.80, 0.82, 0.88,  # 0-5: overnight, slowly rising
    0.98, 1.18, 1.25, 1.20, 1.10, 1.02,  # 6-11: morning rush, then settling
    0.95, 0.88, 0.80, 0.78, 0.80, 0.92,  # 12-17: afternoon trough, then rising
    1.05, 1.10, 1.05, 1.00, 0.95, 0.92,  # 18-23: evening rush, then falling
]


def diurnal_forecast(current_aqi, current_hour):
    if current_aqi is None or current_aqi < 0:
        raise ValueError(f"current_aqi must be non-negative, got {current_aqi!r}")
    if current_hour is None or not (0 <= current_hour <= 23):
        raise ValueError(f"current_hour must be 0-23, got {current_hour!r}")

    # Anchor: the multiplier at current_hour represents "now"; we want the 0th
    # forecast value to be close to current_aqi, so we normalise the curve.
    anchor_mult = _HOUR_MULTIPLIERS[current_hour]
    out = []
    for offset in range(24):
        hour = (current_hour + offset) % 24
        rel = _HOUR_MULTIPLIERS[hour] / anchor_mult
        value = int(round(max(0, current_aqi * rel)))
        out.append(value)
    return out
