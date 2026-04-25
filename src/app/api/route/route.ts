// POST /api/route — plan a walking pair against the AQI grid.
//
// Body:
//   { from: [lon, lat], to: [lon, lat] }
// Or for convenience:
//   { from: "address", to: "address" }  // we'll geocode both.
//
// Returns EngineResult (see src/lib/routingEngine.ts).

import { NextResponse } from 'next/server';
import { planRoutes } from '@/lib/routingEngine';
import { NYC_BBOX, BRONX_PROXIMITY, MAPBOX_TOKEN } from '@/lib/mapbox';

export const runtime = 'nodejs'; // we read aqi-grid.json from disk

type LonLat = [number, number];

function isLonLat(v: unknown): v is LonLat {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

async function geocode(query: string, signal: AbortSignal): Promise<LonLat | null> {
  if (!MAPBOX_TOKEN) throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN missing');
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?bbox=${NYC_BBOX.join(',')}&proximity=${BRONX_PROXIMITY.join(',')}&limit=1` +
    `&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const json = (await res.json()) as { features?: Array<{ center: LonLat }> };
  return json.features?.[0]?.center ?? null;
}

export async function POST(req: Request): Promise<Response> {
  const ac = new AbortController();
  // Cap the engine at 25s — Mapbox + scoring usually <2s, but candidate fan-out
  // is up to 18 calls and free-tier latency varies on stage.
  const timer = setTimeout(() => ac.abort(), 25_000);

  try {
    const body = (await req.json()) as { from?: unknown; to?: unknown };

    let from: LonLat | null = isLonLat(body.from) ? body.from : null;
    let to: LonLat | null = isLonLat(body.to) ? body.to : null;

    if (!from && typeof body.from === 'string') from = await geocode(body.from, ac.signal);
    if (!to && typeof body.to === 'string')   to   = await geocode(body.to,   ac.signal);

    if (!from || !to) {
      return NextResponse.json(
        { error: 'invalid_input', message: 'from and to must be [lon,lat] or NYC addresses' },
        { status: 400 },
      );
    }

    // Defense: reject endpoints far outside NYC.
    const [w, s, e, n] = NYC_BBOX;
    const margin = 0.05;
    const inBox = (p: LonLat) =>
      p[0] >= w - margin && p[0] <= e + margin && p[1] >= s - margin && p[1] <= n + margin;
    if (!inBox(from) || !inBox(to)) {
      return NextResponse.json(
        { error: 'outside_nyc', message: 'AirAware currently covers the 5 boroughs of NYC.' },
        { status: 400 },
      );
    }

    const result = await planRoutes(from, to, ac.signal);
    return NextResponse.json(result, {
      headers: { 'cache-control': 'public, max-age=60, s-maxage=60' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'engine_failed', message }, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}
