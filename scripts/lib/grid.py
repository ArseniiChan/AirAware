"""Lat/lon grid generation for the NYC AQI heatmap layer."""

import math

EARTH_RADIUS_M = 6_371_000


def haversine_m(p1, p2):
    lat1, lon1 = p1
    lat2, lon2 = p2
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def is_likely_nyc(lat, lon):
    """Coarse 5-borough envelope. Filters out NJ (west of the Hudson north of
    Staten Island), Westchester (north edge), and Nassau (east edge) cells
    that the rectangular bbox would otherwise include. Approximate but good
    enough to keep heatmap kernels from smearing pollution into Hackensack.
    """
    # Long Island east of Queens — Nassau
    if lon > -73.70:
        return False
    # Westchester sliver
    if lat > 40.91 and lon > -73.84:
        return False
    # Main 4 boroughs (east of Hudson, south of Westchester)
    if -74.03 <= lon <= -73.70 and 40.55 <= lat <= 40.92:
        return True
    # Staten Island envelope (south of Bayonne, west of Verrazano)
    if 40.49 <= lat <= 40.65 and -74.27 <= lon <= -74.05:
        return True
    # Brooklyn south shoreline
    if 40.55 <= lat <= 40.65 and -74.05 <= lon <= -73.85:
        return True
    return False


def generate_grid(bbox, spacing_m=200):
    min_lon, min_lat, max_lon, max_lat = bbox
    if max_lat <= min_lat or max_lon <= min_lon:
        raise ValueError(f"Inverted or empty bbox: {bbox!r}")
    if spacing_m <= 0:
        raise ValueError(f"spacing_m must be positive, got {spacing_m!r}")

    # 1° latitude is constant ~111.32km. 1° longitude varies with cos(lat).
    lat_step = spacing_m / 111_320.0
    mid_lat = (min_lat + max_lat) / 2
    lon_step = spacing_m / (111_320.0 * math.cos(math.radians(mid_lat)))

    cells = []
    lat = min_lat
    while lat <= max_lat:
        lon = min_lon
        while lon <= max_lon:
            cells.append((round(lat, 5), round(lon, 5)))
            lon += lon_step
        lat += lat_step
    return cells
