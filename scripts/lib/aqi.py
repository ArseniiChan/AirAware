"""EPA AQI band classifier.

Bands match EPA's published AQI categories:
https://www.airnow.gov/aqi/aqi-basics/
"""

_BANDS = (
    (50, "good"),
    (100, "moderate"),
    (150, "sensitive"),
    (200, "unhealthy"),
    (300, "very-unhealthy"),
)


def aqi_band(value):
    if value is None or value < 0:
        raise ValueError(f"AQI value must be a non-negative integer, got {value!r}")
    for upper, name in _BANDS:
        if value <= upper:
            return name
    return "hazardous"
