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
  cells: AqiCell[];
}

let gridCache: GeoJSON.FeatureCollection | null = null;
let inflight: Promise<GeoJSON.FeatureCollection> | null = null;

async function loadGridGeoJson(): Promise<GeoJSON.FeatureCollection> {
  if (gridCache) return gridCache;
  if (!inflight) {
    inflight = fetch('/data/aqi-grid.json', { cache: 'force-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`aqi-grid load: ${r.status}`);
        return r.json() as Promise<AqiGridFile>;
      })
      .then((g) => {
        const fc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: g.cells.map((c) => ({
            type: 'Feature',
            properties: { aqi: c.aqi },
            geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
          })),
        };
        gridCache = fc;
        return fc;
      });
  }
  return inflight;
}

export function HeatmapLayer() {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGridGeoJson()
      .then((fc) => { if (!cancelled) setData(fc); })
      .catch((err) => { console.error('heatmap load failed', err); });
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;

  // Mapbox expression: weight is normalized AQI (50 → 0, 200 → 1).
  // Color stops follow the EPA AQI palette, but desaturated so the routes
  // and basemap labels stay legible underneath.
  return (
    <Source id="aqi-heatmap" type="geojson" data={data} buffer={32}>
      <Layer
        id="aqi-heatmap-layer"
        type="heatmap"
        slot="bottom"
        // Fade out as we zoom in so individual cells take over.
        maxzoom={15}
        paint={{
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'aqi'],
            50, 0,
            100, 0.4,
            150, 0.7,
            200, 1.0,
          ],
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.7,
            14, 1.4,
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(34,197,94,0)',     // transparent
            0.15, 'rgba(132,204,22,0.35)', // good (EPA green)
            0.35, 'rgba(250,204,21,0.55)', // moderate (yellow)
            0.55, 'rgba(249,115,22,0.65)', // sensitive (orange)
            0.75, 'rgba(220,38,38,0.7)',   // unhealthy (red)
            1.0,  'rgba(127,29,29,0.75)',  // hazardous (deep red)
          ],
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 14,
            13, 24,
            15, 36,
          ],
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.85,
            14, 0.7,
            15, 0,
          ],
        }}
      />
      {/* At deep zoom, fade in discrete 200m cells colored by AQI band. */}
      <Layer
        id="aqi-cells-layer"
        type="circle"
        slot="bottom"
        minzoom={13}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            13, 4,
            16, 9,
          ],
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            13, 0,
            14, 0.55,
          ],
          'circle-color': [
            'interpolate', ['linear'], ['get', 'aqi'],
             0,   '#86efac', // good
            50,   '#fde047', // moderate
           100,   '#fb923c', // sensitive
           150,   '#ef4444', // unhealthy
           200,   '#7f1d1d', // very unhealthy
          ],
          'circle-blur': 0.4,
        }}
      />
    </Source>
  );
}
