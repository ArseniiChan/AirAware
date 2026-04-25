// Polyline → exposure stats for the recommendation engine.
// Samples a route's geometry at fixed spacing, looks up AQI per sample, and
// computes the four numbers `RouteExposure` requires.

import { lookupAqi } from './aqiGrid';
import type { RouteExposure } from './recommendation';

type LonLat = [number, number];

const SAMPLE_SPACING_M = 50; // dense enough for 200m AQI cells; cheap enough for 32 lookups/route
const UNHEALTHY_AQI_THRESHOLD = 100; // EPA "Unhealthy for Sensitive Groups" floor

function haversineM(a: LonLat, b: LonLat): number {
  const R = 6_371_000;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function lerp(a: LonLat, b: LonLat, t: number): LonLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Re-sample a polyline at uniform metric spacing. */
export function resamplePolyline(coords: LonLat[], spacingM = SAMPLE_SPACING_M): LonLat[] {
  if (coords.length < 2) return [...coords];
  const out: LonLat[] = [coords[0]];
  let carry = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const segLen = haversineM(a, b);
    if (segLen === 0) continue;
    let dist = spacingM - carry;
    while (dist < segLen) {
      out.push(lerp(a, b, dist / segLen));
      dist += spacingM;
    }
    carry = (carry + segLen) % spacingM;
  }
  out.push(coords[coords.length - 1]);
  return out;
}

/** Total polyline length in meters. */
export function polylineLengthM(coords: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineM(coords[i - 1], coords[i]);
  return total;
}

export interface ScoredRoute {
  exposure: RouteExposure;
  worstSample: { lon: number; lat: number; aqi: number } | null;
  cellsHit: number; // useful for debug + fallbacks
}

/** Score a polyline against the AQI grid, returning the exposure stats the
 *  recommendation engine consumes plus the worst sample for waypoint selection. */
export async function scoreRoute(coords: LonLat[], durationS: number): Promise<ScoredRoute> {
  const samples = resamplePolyline(coords);
  const totalMinutes = durationS / 60;
  // Each sample represents `spacing` meters of walk, so we time-weight by that
  // ratio. Avoid div/0 for trivial routes.
  const lenM = polylineLengthM(coords);
  const minutesPerSample = samples.length > 1 ? totalMinutes / samples.length : totalMinutes;

  let sum = 0;
  let max = 0;
  let unhealthyMinutes = 0;
  let cellsHit = 0;
  let worst: ScoredRoute['worstSample'] = null;

  for (const [lon, lat] of samples) {
    const cell = await lookupAqi(lon, lat);
    if (!cell) continue;
    cellsHit++;
    sum += cell.aqi;
    if (cell.aqi > max) max = cell.aqi;
    if (cell.aqi >= UNHEALTHY_AQI_THRESHOLD) unhealthyMinutes += minutesPerSample;
    if (!worst || cell.aqi > worst.aqi) {
      worst = { lon, lat, aqi: cell.aqi };
    }
  }

  const avg = cellsHit > 0 ? sum / cellsHit : 0;
  return {
    exposure: {
      avgAqi: Math.round(avg),
      maxAqi: Math.round(max),
      exposureMinutes: Math.round(unhealthyMinutes * 10) / 10,
      totalMinutes: Math.round(totalMinutes * 10) / 10,
    },
    worstSample: worst,
    cellsHit,
  };
  // NOTE: lenM is computed but not exposed — callers get it from Mapbox's
  // own `distance` field.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void lenM;
}

/** Shared-edge ratio between two polylines, both snapped to a ~25m grid.
 *  Returns 0..1; >0.7 = "twin routes" per the council's threshold. */
export function sharedEdgeRatio(a: LonLat[], b: LonLat[], snapM = 25): number {
  const snapPoints = (coords: LonLat[]) => {
    const out = new Set<string>();
    const latStep = snapM / 111_111;
    for (const [lon, lat] of coords) {
      const lonStep = snapM / (111_111 * Math.cos((lat * Math.PI) / 180));
      out.add(`${Math.round(lon / lonStep)}:${Math.round(lat / latStep)}`);
    }
    return out;
  };
  const sa = snapPoints(resamplePolyline(a, snapM));
  const sb = snapPoints(resamplePolyline(b, snapM));
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const k of sa) if (sb.has(k)) shared++;
  return shared / Math.min(sa.size, sb.size);
}
