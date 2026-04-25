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

let gridCache: GeoJSON.FeatureCollection | null = null;
let inflight: Promise<GeoJSON.FeatureCollection> | null = null;

/** Build a closed square ring around a cell center, sized to the grid spacing. */
function cellPolygonRing(lon: number, lat: number, spacingM: number): number[][] {
  const halfLat = spacingM / 2 / 111_320;
  const halfLon = spacingM / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lon - halfLon, lat - halfLat],
    [lon + halfLon, lat - halfLat],
    [lon + halfLon, lat + halfLat],
    [lon - halfLon, lat + halfLat],
    [lon - halfLon, lat - halfLat],
  ];
}

async function loadGridGeoJson(): Promise<GeoJSON.FeatureCollection> {
  if (gridCache) return gridCache;
  if (!inflight) {
    inflight = fetch('/data/aqi-grid.json', { cache: 'force-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`aqi-grid load: ${r.status}`);
        return r.json() as Promise<AqiGridFile>;
      })
      .then((g) => {
        const spacing = g.spacing_m ?? 200;
        const fc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: g.cells.map((c) => ({
            type: 'Feature',
            properties: { aqi: c.aqi },
            geometry: {
              type: 'Polygon',
              coordinates: [cellPolygonRing(c.lon, c.lat, spacing)],
            },
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

  // Two layers:
  //
  //  1. Heatmap (low zoom only). At city-wide zoom (10-12) we want the user
  //     to see the broad pollution gradient: Bronx/Hunts Point hot, outer
  //     boroughs cooler. The Gaussian-smoothed heatmap reads cleanly here.
  //
  //  2. Discrete cells (mid + high zoom). The moment the user zooms in to
  //     pick a route — typically zoom 12+ — they want to see block-by-block
  //     variation: the bus depot block, the highway curb, the side street.
  //     Circles sized to roughly cover their 200m cell footprint give that.
  //
  //  Crossfade at zoom 12 → 13 so neither layer is doing both jobs.
  return (
    <Source id="aqi-heatmap" type="geojson" data={data} buffer={32}>
      <Layer
        id="aqi-heatmap-layer"
        type="heatmap"
        slot="bottom"
        maxzoom={13}
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
            10, 0.9,
            12, 1.4,
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(34,197,94,0)',
            0.15, 'rgba(132,204,22,0.18)',
            0.35, 'rgba(250,204,21,0.32)', // moderate
            0.55, 'rgba(249,115,22,0.45)', // sensitive
            0.75, 'rgba(220,38,38,0.55)',  // unhealthy
            1.0,  'rgba(127,29,29,0.62)',  // hazardous
          ],
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 14,
            12, 22,
          ],
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.7,
            11, 0.65,
            12, 0.5,
            13, 0,
          ],
        }}
      />
      {/* Block-level squares take over from zoom 11 onward. Each grid cell
       *  is rendered as its actual 200m × 200m polygon — true block-shaped
       *  fills, not Gaussian-smoothed circles. A thin outline at high zoom
       *  separates adjacent cells visually. */}
      <Layer
        id="aqi-cells-fill"
        type="fill"
        slot="bottom"
        minzoom={11}
        paint={{
          'fill-color': [
            'interpolate', ['linear'], ['get', 'aqi'],
             0,   '#86efac', // good
            50,   '#fde047', // moderate
           100,   '#fb923c', // sensitive
           150,   '#ef4444', // unhealthy
           200,   '#7f1d1d', // very unhealthy
          ],
          'fill-opacity': [
            'interpolate', ['linear'], ['zoom'],
            11, 0,
            12, 0.35,
            13, 0.55,
            14, 0.6,
            16, 0.55,
          ],
          'fill-antialias': true,
        }}
      />
      <Layer
        id="aqi-cells-outline"
        type="line"
        slot="bottom"
        minzoom={14}
        paint={{
          'line-color': '#0f172a',
          'line-width': 0.5,
          'line-opacity': [
            'interpolate', ['linear'], ['zoom'],
            14, 0,
            15, 0.18,
            17, 0.30,
          ],
        }}
      />
    </Source>
  );
}
