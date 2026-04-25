// /api/route engine.
//
// Strategy (per LLM Council verdict + live probe):
//   1. Fetch the direct walking route via Mapbox Directions. Score against
//      the AQI grid. This is "standard" (red).
//   2. Pick a waypoint by perpendicular offset around the worst-AQI sample.
//      Try both sides, two offsets each. Fetch a route through each, score,
//      pick the cleanest that isn't pathologically long.
//   3. If the best candidate still has shared-edge ratio > 0.7 with standard
//      OR isn't measurably cleaner, fall back to widening the offset.
//
// All Mapbox calls go through a tiny LRU + in-flight dedupe so the same
// query isn't fired twice during a demo flurry.

import { scoreRoute, sharedEdgeRatio, type ScoredRoute } from './routeScoring';

const MAPBOX_BASE = 'https://api.mapbox.com/directions/v5/mapbox/walking';
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

type LonLat = [number, number];

interface MapboxRoute {
  distance: number;
  duration: number;
  geometry: { type: 'LineString'; coordinates: LonLat[] };
}

interface MapboxResponse {
  routes: MapboxRoute[];
  code?: string;
  message?: string;
}

const COORDS_FRACTIONS = [0.4, 0.5, 0.6] as const;
const OFFSETS_M = [200, 350, 500] as const;
const SIDES = [+1, -1] as const;
const TWIN_THRESHOLD = 0.7;
const MAX_DISTANCE_RATIO = 1.6; // atlas can be at most 60% longer than standard

const directionsCache = new Map<string, Promise<MapboxResponse>>();

function cacheKey(coords: LonLat[]): string {
  return coords.map(([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(';');
}

async function fetchDirections(coords: LonLat[], signal?: AbortSignal): Promise<MapboxResponse> {
  if (!MAPBOX_TOKEN) throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN missing');
  const key = cacheKey(coords);
  const hit = directionsCache.get(key);
  if (hit) return hit;

  const path = coords.map(([lon, lat]) => `${lon},${lat}`).join(';');
  const url =
    `${MAPBOX_BASE}/${path}` +
    `?alternatives=false&geometries=geojson&overview=full&steps=false` +
    `&access_token=${MAPBOX_TOKEN}`;

  const promise = fetch(url, { signal }).then(async (res) => {
    if (!res.ok) throw new Error(`Mapbox Directions ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as MapboxResponse;
    if (!json.routes || json.routes.length === 0) {
      throw new Error(`Mapbox returned no routes (code=${json.code})`);
    }
    return json;
  });

  directionsCache.set(key, promise);
  // Bounded cache: 64 entries.
  if (directionsCache.size > 64) {
    const oldest = directionsCache.keys().next().value;
    if (oldest !== undefined) directionsCache.delete(oldest);
  }
  return promise;
}

function perpendicularWaypoint(
  origin: LonLat,
  destination: LonLat,
  frac: number,
  offsetM: number,
  side: 1 | -1,
): LonLat {
  const midLon = origin[0] + (destination[0] - origin[0]) * frac;
  const midLat = origin[1] + (destination[1] - origin[1]) * frac;
  // Direction in meters (approx).
  const dxM = (destination[0] - origin[0]) * 111_111 * Math.cos((midLat * Math.PI) / 180);
  const dyM = (destination[1] - origin[1]) * 111_111;
  const L = Math.hypot(dxM, dyM);
  // Unit perpendicular. side=+1 = left of OD, -1 = right.
  const px = (-dyM / L) * side;
  const py = (dxM / L) * side;
  const lon = midLon + (px * offsetM) / (111_111 * Math.cos((midLat * Math.PI) / 180));
  const lat = midLat + (py * offsetM) / 111_111;
  return [lon, lat];
}

export interface EngineResult {
  from: { lon: number; lat: number };
  to:   { lon: number; lat: number };
  standard: {
    distance_m: number;
    duration_s: number;
    geometry: MapboxRoute['geometry'];
    exposure: ScoredRoute['exposure'];
  };
  atlas: {
    distance_m: number;
    duration_s: number;
    geometry: MapboxRoute['geometry'];
    exposure: ScoredRoute['exposure'];
    waypoint?: { lon: number; lat: number };
    waypointSide?: 1 | -1;
    waypointOffsetM?: number;
  };
  divergence: { sharedEdgeRatio: number };
  meta: { engine: 'waypoint-injection-v1'; warning?: string };
}

export async function planRoutes(
  origin: LonLat,
  destination: LonLat,
  signal?: AbortSignal,
): Promise<EngineResult> {
  const stdResp = await fetchDirections([origin, destination], signal);
  const stdRoute = stdResp.routes[0];
  const stdScore = await scoreRoute(stdRoute.geometry.coordinates, stdRoute.duration);

  // Pick waypoints biased toward the worst sample on the standard route, but
  // we also vary the corridor fraction so we don't tunnel into a dead end.
  const candidates: Array<{
    coords: LonLat[];
    frac: number;
    side: 1 | -1;
    offsetM: number;
    waypoint: LonLat;
    score: ScoredRoute;
    sharedEdge: number;
    distance_m: number;
    duration_s: number;
    geometry: MapboxRoute['geometry'];
    cleanerByExposureMin: number; // primary user-visible metric
    cleanerByAvgAqi: number;
  }> = [];

  for (const frac of COORDS_FRACTIONS) {
    for (const side of SIDES) {
      for (const offsetM of OFFSETS_M) {
        const wp = perpendicularWaypoint(origin, destination, frac, offsetM, side);
        try {
          const resp = await fetchDirections([origin, wp, destination], signal);
          const r = resp.routes[0];
          if (r.distance > stdRoute.distance * MAX_DISTANCE_RATIO) continue;
          const sc = await scoreRoute(r.geometry.coordinates, r.duration);
          const sed = sharedEdgeRatio(stdRoute.geometry.coordinates, r.geometry.coordinates);
          candidates.push({
            coords: r.geometry.coordinates,
            frac,
            side,
            offsetM,
            waypoint: wp,
            score: sc,
            sharedEdge: sed,
            distance_m: r.distance,
            duration_s: r.duration,
            geometry: r.geometry,
            cleanerByExposureMin:
              stdScore.exposure.exposureMinutes - sc.exposure.exposureMinutes,
            cleanerByAvgAqi: stdScore.exposure.avgAqi - sc.exposure.avgAqi,
          });
        } catch {
          // Mapbox can refuse some waypoints (water, off-network); just skip.
        }
      }
    }
  }

  // Ranking — read this carefully because it answers the user-facing
  // question "how do you pick the cleaner route":
  //   1. Hard requirement: candidate must have FEWER `exposureMinutes` than
  //      standard (i.e. less time spent in AQI ≥ 100). The previous version
  //      ranked by `avgAqi`, which let a longer detour through uniformly
  //      moderate AQI win even when its TOTAL bad-air minutes were higher.
  //   2. Among candidates that beat standard on exposureMinutes, prefer the
  //      one with the largest reduction.
  //   3. Tie-break by lower avgAqi, then by lower sharedEdge (more visibly
  //      different geometry on screen).
  //   4. If NO candidate beats standard on exposureMinutes, fall back to the
  //      best candidate by avgAqi but emit a warning so the UI can hide
  //      misleading "saves N minutes" copy.
  const diverging = candidates.filter((c) => c.sharedEdge < TWIN_THRESHOLD);
  const pool = diverging.length ? diverging : candidates;

  const trulyCleaner = pool.filter((c) => c.cleanerByExposureMin > 0);
  let best: typeof pool[0] | undefined;
  let warning: string | undefined;

  if (trulyCleaner.length > 0) {
    trulyCleaner.sort((a, b) => {
      if (b.cleanerByExposureMin !== a.cleanerByExposureMin) {
        return b.cleanerByExposureMin - a.cleanerByExposureMin;
      }
      if (b.cleanerByAvgAqi !== a.cleanerByAvgAqi) {
        return b.cleanerByAvgAqi - a.cleanerByAvgAqi;
      }
      return a.sharedEdge - b.sharedEdge;
    });
    best = trulyCleaner[0];
  } else {
    // Nothing beats standard on bad-air minutes. Pick by avgAqi as a soft
    // signal but flag it.
    const fallback = [...pool].sort((a, b) => b.cleanerByAvgAqi - a.cleanerByAvgAqi)[0];
    best = fallback;
    warning = 'atlas not measurably cleaner than standard';
  }

  if (!best) {
    warning = 'no atlas candidate found; returning standard twice';
  } else if (best.sharedEdge >= TWIN_THRESHOLD && !warning) {
    warning = `atlas shares ${(best.sharedEdge * 100).toFixed(0)}% of geometry with standard`;
  }

  return {
    from: { lon: origin[0], lat: origin[1] },
    to: { lon: destination[0], lat: destination[1] },
    standard: {
      distance_m: Math.round(stdRoute.distance),
      duration_s: Math.round(stdRoute.duration),
      geometry: stdRoute.geometry,
      exposure: stdScore.exposure,
    },
    atlas: best
      ? {
          distance_m: Math.round(best.distance_m),
          duration_s: Math.round(best.duration_s),
          geometry: best.geometry,
          exposure: best.score.exposure,
          waypoint: { lon: best.waypoint[0], lat: best.waypoint[1] },
          waypointSide: best.side,
          waypointOffsetM: best.offsetM,
        }
      : {
          distance_m: Math.round(stdRoute.distance),
          duration_s: Math.round(stdRoute.duration),
          geometry: stdRoute.geometry,
          exposure: stdScore.exposure,
        },
    divergence: { sharedEdgeRatio: best ? Math.round(best.sharedEdge * 100) / 100 : 1 },
    meta: { engine: 'waypoint-injection-v1', warning },
  };
}
