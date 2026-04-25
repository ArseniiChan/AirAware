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
import { pruneBacktracks } from './pruneBacktracks';

const MAPBOX_BASE = 'https://api.mapbox.com/directions/v5/mapbox/walking';
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

type LonLat = [number, number];

interface MapboxStep {
  distance: number;
  duration: number;
  name?: string;
  maneuver?: { instruction?: string };
}
interface MapboxLeg {
  steps?: MapboxStep[];
}
interface MapboxRoute {
  distance: number;
  duration: number;
  geometry: { type: 'LineString'; coordinates: LonLat[] };
  legs?: MapboxLeg[];
}

export interface EngineRouteStep {
  instruction: string;
  distance_m: number;
  duration_s: number;
}

function extractSteps(route: MapboxRoute): EngineRouteStep[] {
  const out: EngineRouteStep[] = [];
  for (const leg of route.legs ?? []) {
    for (const s of leg.steps ?? []) {
      out.push({
        instruction: s.maneuver?.instruction ?? s.name ?? 'Continue',
        distance_m: Math.round(s.distance ?? 0),
        duration_s: Math.round(s.duration ?? 0),
      });
    }
  }
  return out;
}

interface MapboxResponse {
  routes: MapboxRoute[];
  code?: string;
  message?: string;
}

const COORDS_FRACTIONS = [0.3, 0.5, 0.7] as const;
const SIDES = [+1, -1] as const;
const TWIN_THRESHOLD = 0.7;
const MAX_DISTANCE_RATIO = 1.9; // atlas can be up to 90% longer if meaningfully cleaner

// Detour offset bracket scaled to the standard walk length. For a long urban
// walk the visible "go around the hot spot" alternative is often 1-2 km
// perpendicular to the direct line (e.g., West Side instead of East Harlem
// for an UES → South Bronx commute). The previous 500m cap was completely
// invisible to those alternatives.
//
// Heuristic: cap detour at ~50% of straight-line distance, hard cap at
// 1500m so we don't ask Mapbox to route through nonsense waypoints over
// water. 60m floor keeps short walks searchable.
function offsetsForDistance(distM: number): readonly number[] {
  const cap = Math.max(60, Math.min(1500, distM * 0.5));
  return [
    Math.round(cap * 0.25),
    Math.round(cap * 0.55),
    Math.round(cap),
  ];
}

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
  // walkway_bias=1 strongly prefers dedicated pedestrian paths and avoids
  // road-class infrastructure (tunnels, highways, ramps). Mapbox's default
  // walking profile occasionally routes through pedestrian-prohibited
  // tunnels in dense Manhattan blocks; this clamp prevents that.
  // alley_bias=-0.3 mildly avoids alleys for kid safety.
  const url =
    `${MAPBOX_BASE}/${path}` +
    `?alternatives=false&geometries=geojson&overview=full&steps=true` +
    `&walkway_bias=1&alley_bias=-0.3` +
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
    steps: EngineRouteStep[];
  };
  atlas: {
    distance_m: number;
    duration_s: number;
    geometry: MapboxRoute['geometry'];
    exposure: ScoredRoute['exposure'];
    waypoint?: { lon: number; lat: number };
    waypointSide?: 1 | -1;
    waypointOffsetM?: number;
    steps: EngineRouteStep[];
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
    legs?: MapboxLeg[];
    cleanerByExposureMin: number; // primary user-visible metric
    cleanerByAvgAqi: number;
  }> = [];

  const offsetsM = offsetsForDistance(stdRoute.distance);
  for (const frac of COORDS_FRACTIONS) {
    for (const side of SIDES) {
      for (const offsetM of offsetsM) {
        const wp = perpendicularWaypoint(origin, destination, frac, offsetM, side);
        try {
          const resp = await fetchDirections([origin, wp, destination], signal);
          const r = resp.routes[0];
          if (r.distance > stdRoute.distance * MAX_DISTANCE_RATIO) continue;

          // Mapbox waypoint routes occasionally produce out-and-back spikes
          // (route walks along a street, hits the waypoint, walks back along
          // the same street). Prune those before scoring. If pruning
          // drastically shortens the route the function bails and returns
          // the original — see lib/pruneBacktracks.ts.
          const pruned = pruneBacktracks(r.geometry.coordinates);
          const prunedCoords = pruned.coords;
          const prunedDistanceM = pruned.prunedDistanceM;
          // Walking pace stays constant — scale duration by the new length.
          const distScale = prunedDistanceM / Math.max(r.distance, 1);
          const prunedDurationS = r.duration * distScale;
          const prunedGeometry = {
            type: 'LineString' as const,
            coordinates: prunedCoords,
          };

          const sc = await scoreRoute(prunedCoords, prunedDurationS);
          const sed = sharedEdgeRatio(stdRoute.geometry.coordinates, prunedCoords);
          candidates.push({
            coords: prunedCoords,
            frac,
            side,
            offsetM,
            waypoint: wp,
            score: sc,
            sharedEdge: sed,
            distance_m: prunedDistanceM,
            duration_s: prunedDurationS,
            geometry: prunedGeometry,
            legs: r.legs,
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

  // Ranking — the green (atlas) route should ALWAYS be the cleanest
  // candidate we find that's strictly cleaner than the red (standard)
  // route. We don't gate on a "meaningful improvement" threshold —
  // even a small AQI win is the right thing to surface, because the
  // red route's job is to be fastest, not cleanest. If literally no
  // candidate is cleaner than standard, atlas falls back to standard
  // and the warning makes that explicit.
  //
  //   1. Primary metric: AVG AQI. Per-step pollution concentration; the
  //      only fair comparison across routes of different lengths.
  //   2. Tie-break by lower exposureMinutes (less time in AQI ≥ 100).
  //   3. Tie-break by lower sharedEdge (more visibly different geometry).
  const diverging = candidates.filter((c) => c.sharedEdge < TWIN_THRESHOLD);
  const pool = diverging.length ? diverging : candidates;

  // Strictly cleaner than standard. cleanerByAvgAqi = std.avgAqi - cand.avgAqi,
  // so > 0 means candidate's per-step AQI is lower than standard's.
  const cleanerThanStandard = pool.filter((c) => c.cleanerByAvgAqi > 0);

  let best: typeof pool[0] | undefined;
  let warning: string | undefined;

  if (cleanerThanStandard.length > 0) {
    cleanerThanStandard.sort((a, b) => {
      if (b.cleanerByAvgAqi !== a.cleanerByAvgAqi) {
        return b.cleanerByAvgAqi - a.cleanerByAvgAqi;
      }
      if (b.cleanerByExposureMin !== a.cleanerByExposureMin) {
        return b.cleanerByExposureMin - a.cleanerByExposureMin;
      }
      return a.sharedEdge - b.sharedEdge;
    });
    best = cleanerThanStandard[0];
    if (best.cleanerByAvgAqi < 2) {
      warning = 'atlas only marginally cleaner than standard';
    }
  } else {
    // No candidate is cleaner. Don't surface a misleading "alternative" —
    // let the UI render standard for both and tell the user honestly.
    best = undefined;
    warning = 'no cleaner alternative found within search radius';
  }

  if (best && best.sharedEdge >= TWIN_THRESHOLD && !warning) {
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
      steps: extractSteps(stdRoute),
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
          steps: extractSteps({
            distance: best.distance_m,
            duration: best.duration_s,
            geometry: best.geometry,
            legs: best.legs,
          }),
        }
      : {
          distance_m: Math.round(stdRoute.distance),
          duration_s: Math.round(stdRoute.duration),
          geometry: stdRoute.geometry,
          exposure: stdScore.exposure,
          steps: extractSteps(stdRoute),
        },
    divergence: { sharedEdgeRatio: best ? Math.round(best.sharedEdge * 100) / 100 : 1 },
    meta: { engine: 'waypoint-injection-v1', warning },
  };
}
