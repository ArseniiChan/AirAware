"""Inverse Distance Weighting interpolation for sparse AQI sensors."""

from .grid import haversine_m


def idw(sensors, target, k=8, power=2):
    if not sensors:
        raise ValueError("sensors list must not be empty")

    sorted_sensors = sorted(
        sensors,
        key=lambda s: haversine_m((s[0], s[1]), target),
    )[:k]

    weighted_sum = 0.0
    weight_total = 0.0
    for lat, lon, value in sorted_sensors:
        d = haversine_m((lat, lon), target)
        if d < 1.0:
            return int(round(value))
        w = 1.0 / (d ** power)
        weighted_sum += w * value
        weight_total += w

    return int(round(weighted_sum / weight_total))
