// Remove out-and-back spikes from a Mapbox walking polyline.
//
// Why this exists: when /api/route requests a Mapbox path through a perpendicular
// waypoint (origin → waypoint → destination), Mapbox sometimes returns a
// geometry that walks out along a street and immediately comes back along the
// same street to reach the next leg. On the map this looks like a "spike" or
// fork off the main route — the user would have to walk back and forth along
// the same block.
//
// We detect these by scanning for pairs of polyline vertices that are
// near-coincident (within a small meters threshold) at non-adjacent positions
// in the path. Everything between such a pair is a loop / spike that doesn't
// make the route get any closer to the destination, so we elide it.

import { polylineLengthM } from './routeScoring';

type LonLat = [number, number];

const EARTH_R = 6_371_000;

function haversineM(a: LonLat, b: LonLat): number {
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

interface PruneResult {
  coords: LonLat[];
  /** Original distance in meters before pruning. */
  originalDistanceM: number;
  /** Distance after pruning. */
  prunedDistanceM: number;
  /** How many spike loops were removed. */
  loopsRemoved: number;
}

/**
 * Iteratively prune out-and-back loops from `coords`.
 *
 * `thresholdM`: two vertices closer than this on the polyline are treated as
 * the same node — anything traversed between them is a loop. 12m roughly
 * matches the granularity of Mapbox's polyline output (vertices snap to
 * intersections / road shape changes), so we won't false-positive on
 * legitimate close-but-distinct intersections.
 *
 * Safety: if pruning would shorten the route by more than 60% of its original
 * length, we return the original — that's almost certainly the user requesting
 * a legitimate loop walk and not a Mapbox quirk.
 */
export function pruneBacktracks(coords: LonLat[], thresholdM = 12): PruneResult {
  const originalDistanceM = polylineLengthM(coords);
  if (coords.length < 4) {
    return { coords: [...coords], originalDistanceM, prunedDistanceM: originalDistanceM, loopsRemoved: 0 };
  }

  let result: LonLat[] = [...coords];
  let loopsRemoved = 0;

  // Cap iterations as a paranoid stop — N² inner with O(loops) outer.
  for (let iter = 0; iter < 32; iter++) {
    let prunedThisPass = false;
    for (let i = 0; i < result.length - 3; i++) {
      // Walk j from the END backwards toward i; the largest j we find that
      // is near-coincident with i means we elide the longest loop possible
      // in one pass.
      let matchJ = -1;
      for (let j = result.length - 1; j > i + 2; j--) {
        if (haversineM(result[i], result[j]) < thresholdM) {
          matchJ = j;
          break;
        }
      }
      if (matchJ > 0) {
        result = [...result.slice(0, i + 1), ...result.slice(matchJ + 1)];
        loopsRemoved++;
        prunedThisPass = true;
        break;
      }
    }
    if (!prunedThisPass) break;
  }

  const prunedDistanceM = polylineLengthM(result);

  // Sanity guard: if pruning ate more than 60% of the route, something
  // upstream is weird (e.g. the user wanted a loop walk). Return original.
  if (prunedDistanceM < originalDistanceM * 0.4) {
    return {
      coords: [...coords],
      originalDistanceM,
      prunedDistanceM: originalDistanceM,
      loopsRemoved: 0,
    };
  }

  return { coords: result, originalDistanceM, prunedDistanceM, loopsRemoved };
}
