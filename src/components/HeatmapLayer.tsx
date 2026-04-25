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
    inflight = fetch(url, { cache: 'force-cache' })
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
          // Every cell contributes — clean cells lightly, dirty cells loudly.
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'aqi'],
            0,   0.05,
            40,  0.12,
            70,  0.25,
            95,  0.40,
            120, 0.60,
            140, 0.80,
            180, 1.0,
          ],
          // Intensity tracks the radius growth — as the kernel widens at
          // high zoom, per-pixel density drops; intensity bumps it back up
          // so the gradient stays visible and the circles don't darken.
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            8,  0.6,
            11, 1.0,
            13, 1.4,
            15, 2.2,
            17, 3.4,
          ],
          // Color ramp — amber at low density through deep red at high.
          // Start with a tiny non-zero alpha so even very low density has
          // a soft tint (whole city colored, no transparent gaps).
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(254, 230, 138, 0)',
            0.05, 'rgba(254, 230, 138, 0.35)', // pale amber
            0.20, 'rgba(252, 211, 77, 0.55)',  // soft yellow
            0.35, 'rgba(251, 191, 36, 0.65)',  // gold
            0.50, 'rgba(251, 146, 60, 0.75)',  // orange
            0.65, 'rgba(249, 115, 22, 0.82)',  // dark orange
            0.78, 'rgba(239, 68, 68, 0.88)',   // red
            0.90, 'rgba(220, 38, 38, 0.92)',   // dark red
            1.0,  'rgba(127, 29, 29, 0.94)',   // hazardous deep red
          ],
          // Radius doubles each zoom level so kernels keep overlapping their
          // 200m-spaced neighbors at every zoom. Without this, at zoom 15+
          // each cell renders as its own discrete circle — the "bunch of
          // circles" the user complained about. 200m on screen ≈ 21px @ z13,
          // 84px @ z15, 336px @ z17 → radius needs to roughly match.
          'heatmap-radius': [
            'interpolate', ['exponential', 2], ['zoom'],
            8,  6,
            10, 16,
            12, 48,
            14, 160,
            16, 600,
            18, 1024,
          ],
          'heatmap-opacity': 0.85,
        }}
      />
    </Source>
  );
}
