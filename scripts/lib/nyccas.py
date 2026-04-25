"""NYCCAS — NYC Community Air Survey (DOHMH).

Block-level annual PM2.5 + NO2 measurements at ~150 calibrated monitoring
sites across NYC, published by the NYC Department of Health and Mental
Hygiene. The data anchors our heatmap with NYC's own ground-truth
measurements rather than just regional + community sensor mixtures.

Live data path: NYC publishes NYCCAS as raster GeoTIFFs at NYC Open Data
(resource id q68s-8qxv). To consume the rasters live we'd need rasterio
or GDAL plus a per-cell sample at our 200m grid centroids. For the
hackathon we ship a synthetic fixture modeled on values published in
NYCCAS Report 16 (Sept 2023) — same site coordinates and concentrations
NYC measures, hand-keyed for offline use. Live raster sampling is a
documented follow-up.

Sites report annual averages, so they don't fluctuate hourly the way
AirNow + OpenAQ + PurpleAir do. Treating them as a stable per-block
baseline that other sources can adjust around is exactly what NYCCAS is
designed for.
"""

import json
import os
from pathlib import Path

from .purpleair import pm25_to_aqi


def _no2_ppb_to_aqi(value_ppb):
    """EPA NO2 (ppb, 1-hour) → US AQI."""
    if value_ppb is None or value_ppb < 0:
        return None
    breaks = [
        (0, 53, 0, 50),
        (54, 100, 51, 100),
        (101, 360, 101, 150),
        (361, 649, 151, 200),
        (650, 1249, 201, 300),
    ]
    for c_lo, c_hi, i_lo, i_hi in breaks:
        if c_lo <= value_ppb <= c_hi:
            return int(round((i_hi - i_lo) / (c_hi - c_lo) * (value_ppb - c_lo) + i_lo))
    return 300


class NYCCASClient:
    """Reads from NYCCAS fixture (or, when configured, from raster downloads
    keyed via NYC_OPEN_DATA_APP_TOKEN — that path is left as a follow-up).
    """

    def __init__(self, app_token=None, fixture_dir=None):
        self.app_token = app_token or os.environ.get("NYC_OPEN_DATA_APP_TOKEN")
        self.fixture_dir = Path(fixture_dir) if fixture_dir else Path(__file__).parent.parent / "fixtures"
        self._fixture = None

    @property
    def is_offline(self):
        # Always offline for now — live raster sampling is a follow-up.
        # Kept the env-var check so when we wire raster sampling, callers
        # can pass NYC_OPEN_DATA_APP_TOKEN and switch behavior.
        return True

    def _load_fixture(self):
        if self._fixture is None:
            with open(self.fixture_dir / "nyccas_sites.json") as f:
                self._fixture = json.load(f)
        return self._fixture

    def sensors_in_bbox(self, bbox):
        """bbox = (min_lon, min_lat, max_lon, max_lat).

        Returns one normalized sensor PER POLLUTANT per site (PM2.5 + NO2),
        with `aqi` already computed via EPA breakpoints. The merge in
        ingest_aqi.py picks the worst (highest AQI) per (lat, lon).
        """
        min_lon, min_lat, max_lon, max_lat = bbox
        data = self._load_fixture()

        out = []
        for s in data["sites"]:
            if not (min_lon <= s["lon"] <= max_lon and min_lat <= s["lat"] <= max_lat):
                continue
            pm_aqi = pm25_to_aqi(s["pm25_ugm3"])
            if pm_aqi is not None:
                out.append({
                    "lat": s["lat"], "lon": s["lon"],
                    "aqi": pm_aqi, "parameter": "PM2.5",
                    "source": "NYCCAS", "site_id": s["site_id"],
                })
            no2_aqi = _no2_ppb_to_aqi(s["no2_ppb"])
            if no2_aqi is not None:
                out.append({
                    "lat": s["lat"], "lon": s["lon"],
                    "aqi": no2_aqi, "parameter": "NO2",
                    "source": "NYCCAS", "site_id": s["site_id"],
                })
        return out
