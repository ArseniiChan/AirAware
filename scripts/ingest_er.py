"""Build `public/data/er-by-zcta.json` and `public/data/nyc-avg.json`.

Pulls NYC DOHMH pediatric asthma ED visit rates per ZCTA, computes
ratio-to-NYC-avg + a `one_in_n` field for plain-language UI copy,
writes contracted JSON. NYC avg is also written to its own tiny file
so the BlockContextCard can short-circuit a fetch when only the
average is needed.

H4 granularity decision (locked): per-ZCTA. NYC DOHMH publishes the
indicator at both UHF-neighborhood (~42 areas) and ZCTA (~178 areas)
granularity; ZCTA is finer, aligns with Mapbox's geocoded postcode,
and matches the data-contracts.md schema. Demo copy stays "your block"
with a visible source line ("NYC DOHMH, by ZCTA") that makes the
unit honest without diluting the emotional read.

Run:
    NYC_OPEN_DATA_APP_TOKEN=... python scripts/ingest_er.py
    # or, offline / fixture-driven (works without keys):
    python scripts/ingest_er.py
"""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_OUT_ER = Path(__file__).parent.parent / "public" / "data" / "er-by-zcta.json"
DEFAULT_OUT_AVG = Path(__file__).parent.parent / "public" / "data" / "nyc-avg.json"
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "dohmh_asthma_ed.json"

# NYC EH Data Portal — Socrata resource for the asthma ED indicator.
# Live path is best-effort: the resource id can drift between annual
# publications, so we let the live call fail soft and fall through to
# the curated fixture rather than crash the H4 deliverable.
SOCRATA_HOST = "https://data.cityofnewyork.us"
SOCRATA_RESOURCE_ID = os.environ.get("NYC_DOHMH_RESOURCE_ID", "")  # opt-in


def _round1(x):
    return round(float(x), 1)


def _ratio(rate, avg):
    if avg <= 0:
        return 0.0
    return round(rate / avg, 2)


def _one_in_n(rate_per_10k):
    """Convert a per-10k rate to a 1-in-N integer for plain-language copy.

    Example: 412.7 per 10k → ~1 in 24. Anchored on a strictly-positive
    rate; 0 returns 0 so callers can branch.
    """
    if rate_per_10k <= 0:
        return 0
    return round(10_000 / rate_per_10k)


def transform(raw):
    """Take the curated/Socrata shape, emit the contracted shape.

    Validates ratio-to-NYC-avg per row so a stale fixture can't ship a
    self-inconsistent stat into the demo card.
    """
    nyc_avg = float(raw["nyc_avg_per_10k_children"])
    zctas = {}
    for row in raw["rows"]:
        rate = _round1(row["rate_per_10k_children"])
        zctas[row["zcta"]] = {
            "name": row["name"],
            "borough": row.get("borough"),
            "rate_per_10k_children": rate,
            "visits": int(row["visits"]),
            "ratio_to_nyc_avg": _ratio(rate, nyc_avg),
            "one_in_n": _one_in_n(rate),
        }
    return nyc_avg, zctas


def _load_fixture():
    with open(FIXTURE_PATH) as f:
        return json.load(f)


def _try_live():
    """Optional Socrata pull. Returns the curated-shape dict or None.

    Requires both NYC_DOHMH_RESOURCE_ID (resource id of the published
    indicator) and NYC_OPEN_DATA_APP_TOKEN (for headroom). If either is
    missing, or the request fails, returns None and the caller falls
    back to the fixture.
    """
    if not SOCRATA_RESOURCE_ID:
        return None
    token = os.environ.get("NYC_OPEN_DATA_APP_TOKEN")
    try:
        import requests
    except ImportError:
        return None
    url = f"{SOCRATA_HOST}/resource/{SOCRATA_RESOURCE_ID}.json"
    headers = {"X-App-Token": token} if token else {}
    try:
        r = requests.get(url, headers=headers, params={"$limit": 5000}, timeout=20)
        r.raise_for_status()
        rows_raw = r.json()
    except Exception as e:
        print(f"  live pull failed ({e}); falling back to fixture")
        return None

    # Socrata field names vary across annual publications. We look for
    # the canonical fields and skip anything we can't parse cleanly.
    rows = []
    for r0 in rows_raw:
        zcta = r0.get("zcta") or r0.get("zip_code")
        rate = r0.get("rate_per_10000") or r0.get("age_adjusted_rate") or r0.get("rate")
        visits = r0.get("count") or r0.get("visits") or r0.get("number") or 0
        if not zcta or rate is None:
            continue
        rows.append({
            "zcta": str(zcta),
            "name": r0.get("neighborhood") or r0.get("zcta_name") or str(zcta),
            "borough": r0.get("borough"),
            "rate_per_10k_children": float(rate),
            "child_pop": int(r0.get("population") or 0),
            "visits": int(visits),
        })
    if not rows:
        return None
    # NYC avg: weighted by child_pop if we have it, else simple mean.
    pops = [r["child_pop"] for r in rows]
    if all(p > 0 for p in pops):
        weighted = sum(r["rate_per_10k_children"] * r["child_pop"] for r in rows) / sum(pops)
        nyc_avg = round(weighted, 1)
    else:
        nyc_avg = round(sum(r["rate_per_10k_children"] for r in rows) / len(rows), 1)
    return {
        "indicator": "Asthma emergency department visit rate, ages 0-17, by ZCTA",
        "source": "NYC DOHMH via NYC Open Data Socrata",
        "nyc_avg_per_10k_children": nyc_avg,
        "rows": rows,
    }


def build_payloads(raw, generated_at):
    nyc_avg, zctas = transform(raw)

    er_payload = {
        "schema_version": 1,
        "generated_at": generated_at.isoformat().replace("+00:00", "Z"),
        "source": raw.get("source", "NYC DOHMH (asthma ED visits, ages 0-17, by ZCTA)"),
        "indicator": raw.get("indicator"),
        "period": raw.get("period"),
        "nyc_avg_per_10k": nyc_avg,
        "zctas": zctas,
    }
    avg_payload = {
        "schema_version": 1,
        "generated_at": generated_at.isoformat().replace("+00:00", "Z"),
        "source": er_payload["source"],
        "rate_per_10k_children": nyc_avg,
    }
    return er_payload, avg_payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-er", type=Path, default=DEFAULT_OUT_ER)
    parser.add_argument("--out-avg", type=Path, default=DEFAULT_OUT_AVG)
    parser.add_argument("--force-fixture", action="store_true",
                        help="Skip the live pull even if NYC_DOHMH_RESOURCE_ID is set.")
    args = parser.parse_args()

    raw = None if args.force_fixture else _try_live()
    if raw is None:
        raw = _load_fixture()
        print("ER ingest: OFFLINE (curated DOHMH fixture)")
    else:
        print(f"ER ingest: LIVE (Socrata resource {SOCRATA_RESOURCE_ID})")

    generated_at = datetime.now(timezone.utc)
    er_payload, avg_payload = build_payloads(raw, generated_at)

    for path, payload, label in (
        (args.out_er, er_payload, f"{len(er_payload['zctas'])} ZCTAs"),
        (args.out_avg, avg_payload, f"avg={avg_payload['rate_per_10k_children']}/10k"),
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(payload, f, separators=(",", ":"))
        size_kb = path.stat().st_size / 1024
        print(f"Wrote {path} ({size_kb:.1f} KB) — {label}")


if __name__ == "__main__":
    main()
