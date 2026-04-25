// Spatial index over public/data/aqi-grid.json.
//
// The grid is a 200m lattice of ~60k AQI cells covering the 5 boroughs. We
// only do nearest-cell lookups for route AQI sampling, so a fixed-bucket hash
// map keyed on (lat_idx, lon_idx) gives O(1) lookup. Points that miss the
// exact bucket fall through to a 3x3 neighborhood search.
//
// Module-level cache: Next.js reuses the module across warm requests, so the
// 5MB grid is read from disk once per server boot.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type AqiBand = 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very-unhealthy' | 'hazardous';

export interface AqiCell {
  lat: number;
  lon: number;
  aqi: number;
  band: AqiBand;
  dominant_pollutant?: string;
}

interface AqiGridFile {
  schema_version: number;
  generated_at: string;
  source: string;
  bbox: [number, number, number, number];
  spacing_m: number;
  cells: AqiCell[];
}

interface IndexedGrid {
  spacingM: number;
  latStep: number;
  lonStep: number;
  bbox: [number, number, number, number];
  byBucket: Map<string, AqiCell>;
  generatedAt: string;
}

let cached: IndexedGrid | null = null;
let inflight: Promise<IndexedGrid> | null = null;

const FILE_REL = 'public/data/aqi-grid.json';

function bucketKey(latIdx: number, lonIdx: number): string {
  return `${latIdx}:${lonIdx}`;
}

async function loadAndIndex(): Promise<IndexedGrid> {
  const full = path.join(process.cwd(), FILE_REL);
  const raw = await fs.readFile(full, 'utf8');
  const parsed: AqiGridFile = JSON.parse(raw);
  if (parsed.schema_version !== 1) {
    throw new Error(`aqi-grid.json schema_version ${parsed.schema_version} not supported`);
  }
  // Convert spacing_m to degree steps (lat is uniform; lon depends on lat,
  // we'll use the bbox center for the bucket grid — fine for indexing because
  // exact distance is recomputed at lookup time).
  const latCenter = (parsed.bbox[1] + parsed.bbox[3]) / 2;
  const latStep = parsed.spacing_m / 111_111;
  const lonStep = parsed.spacing_m / (111_111 * Math.cos((latCenter * Math.PI) / 180));

  const byBucket = new Map<string, AqiCell>();
  for (const c of parsed.cells) {
    const k = bucketKey(Math.round(c.lat / latStep), Math.round(c.lon / lonStep));
    // If two cells hash to the same bucket (shouldn't on a regular grid), keep
    // the one closer to its bucket center; we approximate by keeping the first.
    if (!byBucket.has(k)) byBucket.set(k, c);
  }

  return {
    spacingM: parsed.spacing_m,
    latStep,
    lonStep,
    bbox: parsed.bbox,
    byBucket,
    generatedAt: parsed.generated_at,
  };
}

export async function aqiGrid(): Promise<IndexedGrid> {
  if (cached) return cached;
  if (!inflight) inflight = loadAndIndex().then((g) => { cached = g; return g; });
  return inflight;
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest-cell lookup. Returns null if outside the grid bbox. */
export async function lookupAqi(lon: number, lat: number): Promise<AqiCell | null> {
  const g = await aqiGrid();
  const [w, s, e, n] = g.bbox;
  if (lon < w - g.lonStep || lon > e + g.lonStep || lat < s - g.latStep || lat > n + g.latStep) {
    return null;
  }
  const latIdx = Math.round(lat / g.latStep);
  const lonIdx = Math.round(lon / g.lonStep);

  // Try the exact bucket first; fall through to a 3x3 search.
  const exact = g.byBucket.get(bucketKey(latIdx, lonIdx));
  if (exact) return exact;

  let best: AqiCell | null = null;
  let bestD = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cell = g.byBucket.get(bucketKey(latIdx + dy, lonIdx + dx));
      if (!cell) continue;
      const d = haversineM([lon, lat], [cell.lon, cell.lat]);
      if (d < bestD) { bestD = d; best = cell; }
    }
  }
  return best;
}
