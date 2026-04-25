"""NASA TEMPO — Tropospheric Emissions: Monitoring of Pollution.

Geostationary satellite launched April 2023. Hourly NO2, O3, HCHO over
North America at ~2-10 km resolution. Free for research/operational use
via NASA Earthdata.

Live data path (follow-up): authenticate to NASA Earthdata Login (free
signup at https://urs.earthdata.nasa.gov/), use the Harmony API or direct
ASDC OPeNDAP endpoints to subset TEMPO L2 NO2 retrievals over the NYC
bbox. Set EARTHDATA_TOKEN env var. The L2 data is in NetCDF4 format and
needs xarray + netCDF4 to read.

For the hackathon we ship a synthetic fixture modeled on clear-sky NYC
TEMPO L2 NO2 retrievals from 2024 — same ~10km pixel grid, same column
density magnitudes — so the merge into the heatmap is data-shaped
correctly. Live integration is documented as a follow-up; the offline
fixture survives a network-down demo.

Column-density to surface-AQI conversion: TEMPO measures vertical
tropospheric NO2 column density (molecules/cm²). Surface concentration
in ppb ≈ column / boundary-layer mixing height. With a 1km mixing height
typical for NYC daytime, column 1×10^15 molec/cm² ≈ ~1.5 ppb. We then
run that ppb through EPA's NO2 → AQI breakpoints (same helper as NYCCAS).
"""

import json
import os
from pathlib import Path

# TEMPO column → surface ppb heuristic.
# Column molec/cm² × Avogadro factor / mixing_height(cm) ≈ ppb.
# For a 1km PBL, the empirical scaling is ~1.5 ppb per 10^15 molec/cm².
_PPB_PER_1E15_COLUMN = 1.5


def _no2_ppb_to_aqi(value_ppb):
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


def column_to_aqi(column_1e15):
    """Convert tropospheric NO2 column density (10^15 molec/cm²) to US AQI."""
    if column_1e15 is None or column_1e15 < 0:
        return None
    surface_ppb = column_1e15 * _PPB_PER_1E15_COLUMN
    return _no2_ppb_to_aqi(surface_ppb)


class TempoClient:
    def __init__(self, earthdata_token=None, fixture_dir=None):
        self.earthdata_token = earthdata_token or os.environ.get("EARTHDATA_TOKEN")
        self.fixture_dir = Path(fixture_dir) if fixture_dir else Path(__file__).parent.parent / "fixtures"
        self._fixture = None

    @property
    def is_offline(self):
        # Live integration path is a follow-up — see module docstring.
        # Always offline for now even if EARTHDATA_TOKEN is set.
        return True

    def _load_fixture(self):
        if self._fixture is None:
            with open(self.fixture_dir / "tempo_no2.json") as f:
                self._fixture = json.load(f)
        return self._fixture

    def sensors_in_bbox(self, bbox):
        """bbox = (min_lon, min_lat, max_lon, max_lat).

        Returns one normalized sensor per TEMPO pixel inside the bbox, with
        column density converted to a surface NO2 AQI. The IDW interpolation
        in ingest_aqi.py treats these as additional sparse data points,
        weighted with the same 1/d² as ground sensors — which is reasonable
        because TEMPO's 10km resolution is sparser than ground sensors but
        provides regional NO2 baseline that ground networks can miss
        (e.g., over the East River, wide open avenues).
        """
        min_lon, min_lat, max_lon, max_lat = bbox
        data = self._load_fixture()
        out = []
        for p in data["pixels"]:
            if not (min_lon <= p["lon"] <= max_lon and min_lat <= p["lat"] <= max_lat):
                continue
            aqi = column_to_aqi(p["no2_column_1e15"])
            if aqi is None:
                continue
            out.append({
                "lat": p["lat"], "lon": p["lon"],
                "aqi": aqi, "parameter": "NO2",
                "source": "TEMPO", "label": p.get("label"),
            })
        return out
