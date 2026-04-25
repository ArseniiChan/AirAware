"""Test the math powering the BlockContextCard's plain-language copy.

The "1 in 24 kids" stat and the "4.5x NYC average" comparison are the
emotional core of the demo. If either drifts, judges see numbers that
don't internally agree. These tests pin the conversions so a fixture
edit can't quietly break the card.
"""

import json
from pathlib import Path

import pytest

from ingest_er import _one_in_n, _ratio, build_payloads, transform


@pytest.fixture
def sample_raw():
    return {
        "indicator": "Asthma emergency department visit rate, ages 0-17, by ZCTA",
        "source": "test fixture",
        "nyc_avg_per_10k_children": 92.4,
        "rows": [
            {"zcta": "10454", "name": "Mott Haven", "borough": "Bronx",
             "rate_per_10k_children": 412.7, "child_pop": 4530, "visits": 187},
            {"zcta": "10024", "name": "Upper West Side", "borough": "Manhattan",
             "rate_per_10k_children": 58.6, "child_pop": 11420, "visits": 67},
        ],
    }


class TestOneInN:
    def test_high_bronx_rate_is_one_in_24(self):
        # 412.7 per 10k → 10000/412.7 ≈ 24.23 → rounds to 24
        assert _one_in_n(412.7) == 24

    def test_nyc_average_is_about_one_in_108(self):
        assert _one_in_n(92.4) == 108

    def test_zero_rate_returns_zero(self):
        assert _one_in_n(0) == 0

    def test_negative_rate_returns_zero(self):
        assert _one_in_n(-5) == 0


class TestRatio:
    def test_bronx_ratio_to_nyc_avg(self):
        # 412.7 / 92.4 = 4.4664... → rounds to 4.47
        assert _ratio(412.7, 92.4) == 4.47

    def test_below_average_ratio_is_under_one(self):
        assert _ratio(58.6, 92.4) == 0.63

    def test_zero_avg_is_safe(self):
        assert _ratio(100, 0) == 0.0


class TestTransform:
    def test_transform_preserves_zcta_keys(self, sample_raw):
        nyc_avg, zctas = transform(sample_raw)
        assert nyc_avg == 92.4
        assert set(zctas.keys()) == {"10454", "10024"}

    def test_transform_attaches_one_in_n(self, sample_raw):
        _, zctas = transform(sample_raw)
        assert zctas["10454"]["one_in_n"] == 24

    def test_transform_attaches_ratio(self, sample_raw):
        _, zctas = transform(sample_raw)
        assert zctas["10454"]["ratio_to_nyc_avg"] == 4.47

    def test_transform_round_trips_visits_as_int(self, sample_raw):
        _, zctas = transform(sample_raw)
        assert zctas["10454"]["visits"] == 187
        assert isinstance(zctas["10454"]["visits"], int)


class TestBuildPayloads:
    def test_er_payload_schema_version(self, sample_raw):
        from datetime import datetime, timezone
        er, _ = build_payloads(sample_raw, datetime.now(timezone.utc))
        assert er["schema_version"] == 1
        assert "generated_at" in er
        assert er["nyc_avg_per_10k"] == 92.4

    def test_avg_payload_is_minimal(self, sample_raw):
        from datetime import datetime, timezone
        _, avg = build_payloads(sample_raw, datetime.now(timezone.utc))
        assert avg["rate_per_10k_children"] == 92.4
        assert avg["schema_version"] == 1


class TestShippedFixtureIsInternallyConsistent:
    """If the curated DOHMH fixture is edited, the hero stat must still pencil out.

    The pitch lands on '1 in 24 kids on your block' for Mott Haven and
    '4.5x the NYC average'. If a future edit tweaks the fixture rate
    without checking, this test fails before the copy ships broken.
    """

    @pytest.fixture
    def shipped_fixture(self):
        path = Path(__file__).parent.parent / "fixtures" / "dohmh_asthma_ed.json"
        with open(path) as f:
            return json.load(f)

    def test_mott_haven_still_lands_on_one_in_24(self, shipped_fixture):
        rows = {r["zcta"]: r for r in shipped_fixture["rows"]}
        assert _one_in_n(rows["10454"]["rate_per_10k_children"]) == 24

    def test_mott_haven_ratio_lands_near_4_5x(self, shipped_fixture):
        rows = {r["zcta"]: r for r in shipped_fixture["rows"]}
        ratio = _ratio(
            rows["10454"]["rate_per_10k_children"],
            shipped_fixture["nyc_avg_per_10k_children"],
        )
        assert 4.4 <= ratio <= 4.6
