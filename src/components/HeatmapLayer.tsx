'use client';

// Renders the 60k-cell aqi-grid.json as a Mapbox heatmap layer. Heatmap is
// preferred over per-cell circles because (a) the grid is dense enough that
// kernel blending reads as continuous air pollution, and (b) Mapbox's GPU
// heatmap is faster than 60k circle features at low zoom.
//
// At higher zooms (>= 14) the heatmap fades and we switch to a circle layer
// so judges who pinch in see the discrete 200m cells colored individually.

import { useEffect, useState } from 'react';
import { Layer, Source } from 'react-map-gl';

interface AqiCell {
  lat: number;
  lon: number;
  aqi: number;
  band: string;
}

interface AqiGridFile {
  schema_version: number;
  bbox: [number, number, number, number];
  spacing_m: number;
  cells: AqiCell[];
}

// Per-hour cache. The pipeline emits aqi-grid-h0.json ... aqi-grid-h23.json
// when run with --all-hours; each hour's grid reflects that hour's traffic
// boost (peak AM/PM rush vs overnight troughs). The default aqi-grid.json
// is the snapshot for the current local hour.
const gridCache = new Map<string, GeoJSON.FeatureCollection>();
const inflightCache = new Map<string, Promise<GeoJSON.FeatureCollection>>();

async function loadGridGeoJson(url: string): Promise<GeoJSON.FeatureCollection> {
  const cached = gridCache.get(url);
  if (cached) return cached;
  let inflight = inflightCache.get(url);
  if (!inflight) {
    // 'no-cache' = always validate with server; doesn't bypass cache
    // entirely but ensures we never serve a stale aqi-grid.json after
    // the pipeline regenerates the file.
    inflight = fetch(url, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`${url} load: ${r.status}`);
        return r.json() as Promise<AqiGridFile>;
      })
      .then((g) => {
        // Point features (centroids) — the heatmap layer smooths between
        // them via Gaussian kernels, so adjacent 200m cells blend instead
        // of showing hard square edges.
        const fc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: g.cells.map((c) => ({
            type: 'Feature',
            properties: { aqi: c.aqi },
            geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
          })),
        };
        gridCache.set(url, fc);
        inflightCache.delete(url);
        return fc;
      });
    inflightCache.set(url, inflight);
  }
  return inflight;
}

interface HeatmapLayerProps {
  /** Optional NYC-local hour (0-23). When provided, loads the hour-specific
   *  grid snapshot so the heatmap reflects that hour's traffic intensity.
   *  Falls back to /data/aqi-grid.json (the default snapshot) on miss. */
  hour?: number;
}

export function HeatmapLayer({ hour }: HeatmapLayerProps = {}) {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = hour != null ? `/data/aqi-grid-h${hour}.json` : '/data/aqi-grid.json';
    loadGridGeoJson(url)
      .then((fc) => { if (!cancelled) setData(fc); })
      .catch(async (err) => {
        // Hour-specific file may not exist yet (e.g. team hasn't run
        // --all-hours). Fall back to the default snapshot.
        if (hour != null) {
          try {
            const fc = await loadGridGeoJson('/data/aqi-grid.json');
            if (!cancelled) setData(fc);
            return;
          } catch (e) { /* fall through to log */ }
        }
        console.error('heatmap load failed', err);
      });
    return () => { cancelled = true; };
  }, [hour]);

  if (!data) return null;

  // Heatmap layer with kernels sized so neighboring 200m cells blend
  // smoothly instead of showing hard square edges. Every cell contributes
  // (weight starts at AQI 0) so the whole city is tinted; clean cells just
  // contribute a small amount, dirty cells contribute strongly.
  return (
    <Source id="aqi-heatmap" type="geojson" data={data} buffer={32}>
      <Layer
        id="aqi-heatmap-layer"
        type="heatmap"
        slot="bottom"
        paint={{
          // Only AQI ≥ 60 contributes. Below that, weight = 0 → cell adds
          // nothing → basemap shows through (clean blocks are clear, not
          // tinted yellow). The pollution-relevant signal carries the color.
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'aqi'],
            60,  0,
            75,  0.10,
            95,  0.30,
            120, 0.55,
            145, 0.80,
            180, 1.0,
          ],
          // Intensity tracks radius growth so colors stay visible at high
          // zoom even though kernel area gets bigger.
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            8,  0.7,
            11, 1.1,
            13, 1.6,
            15, 2.4,
            17, 3.6,
          ],
          // Color ramp starts FULLY TRANSPARENT at low density — bleeding
          // kernels from boundary cells fade to invisible over NJ / outer
          // boroughs. Polluted areas burn through visibly.
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(0, 0, 0, 0)',
            0.05, 'rgba(254, 230, 138, 0)',
            0.15, 'rgba(252, 211, 77, 0.35)',
            0.30, 'rgba(251, 191, 36, 0.55)',
            0.50, 'rgba(251, 146, 60, 0.72)',
            0.65, 'rgba(249, 115, 22, 0.82)',
            0.80, 'rgba(239, 68, 68, 0.88)',
            0.92, 'rgba(220, 38, 38, 0.92)',
            1.0,  'rgba(127, 29, 29, 0.94)',
          ],
          // Tighter radius schedule. Big enough to overlap 200m-spaced
          // neighbors but not so big it smears across the Hudson. At z14,
          // 200m ≈ 42px on screen → radius 48 = ~1.1x cell spacing → just
          // enough overlap to look smooth without wide bleed.
          'heatmap-radius': [
            'interpolate', ['exponential', 1.6], ['zoom'],
            8,  4,
            10, 10,
            12, 24,
            14, 48,
            16, 120,
            18, 280,
          ],
          'heatmap-opacity': 0.9,
        }}
      />
    </Source>
  );
}
