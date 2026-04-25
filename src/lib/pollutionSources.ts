// Layer hand-curated point pollution sources (bus depots, highways,
// industrial zones) on top of the EPA AirNow grid. The grid is 200m × 200m,
// so two streets one block apart often score identical AQI even when one
// runs along Bruckner and the other doesn't. This module adds a Gaussian
// distance-decay penalty per source so the engine can distinguish them.
//
// Penalty model: penalty(d) = max_penalty * exp(-(d / sigma)^2)
// At d = sigma the penalty drops to ~37% of max; at d = 2*sigma to ~2%.
//
// Module-level cache: the JSON is small (<2KB) and read once per server boot.

import { promises as fs } from 'node:fs';
import path from 'node:path';

interface PollutionSource {
  name: string;
  type: string;
  lon: number;
  lat: number;
  max_penalty: number;
  sigma_m: number;
}

interface PollutionFile {
  schema_version: number;
  sources: PollutionSource[];
}

const FILE_REL = 'public/data/pollution-sources.json';
let cached: PollutionSource[] | null = null;

async function loadSources(): Promise<PollutionSource[]> {
  if (cached) return cached;
  const full = path.join(process.cwd(), FILE_REL);
  const raw = await fs.readFile(full, 'utf8');
  const parsed: PollutionFile = JSON.parse(raw);
  cached = parsed.sources;
  return cached;
}

function haversineM(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const R = 6_371_000;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Sum of penalty contributions from all known pollution sources at this point. */
export async function pollutionPenalty(lon: number, lat: number): Promise<number> {
  const sources = await loadSources();
  let total = 0;
  for (const s of sources) {
    // Cheap bbox cull: if either coord is more than 3*sigma away in a single
    // axis, the contribution is <0.01% of max. Skip the haversine.
    const sigmaDeg = s.sigma_m / 111_111;
    if (Math.abs(lon - s.lon) > 3 * sigmaDeg / Math.cos((lat * Math.PI) / 180)) continue;
    if (Math.abs(lat - s.lat) > 3 * sigmaDeg) continue;
    const d = haversineM(lon, lat, s.lon, s.lat);
    total += s.max_penalty * Math.exp(-((d / s.sigma_m) ** 2));
  }
  return total;
}
