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

  // Strategy:
  //
  //  1. Heatmap (zoom < 12): only the WORST cells contribute. weight = 0
  //     below AQI 70 so clean areas stay transparent. Small radius keeps
  //     hot spots distinct rather than smearing into a uniform tint.
  //
  //  2. Polygon fills (zoom >= 11): each cell rendered as its actual 200m
  //     square. Opacity is driven BY AQI itself (not just zoom) — polluted
  //     cells are loud, clean cells fade into the basemap. This is what
  //     gives the map clear hot vs clean contrast.
  //
  //  No outlines — they read as grid lines and obscure the data.
  return (
    <Source id="aqi-heatmap" type="geojson" data={data} buffer={32}>
      <Layer
        id="aqi-heatmap-layer"
        type="heatmap"
        slot="bottom"
        maxzoom={12}
        paint={{
          // Only sensitive+ cells (AQI >= 70) contribute meaningfully. Below
          // that, weight = 0, so clean areas don't smear orange into reds.
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'aqi'],
            70,  0,
            90,  0.25,
            120, 0.55,
            160, 0.85,
            200, 1.0,
          ],
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            9,  0.8,
            11, 1.1,
            12, 1.4,
          ],
          // Sharper transition: small density already shows orange; high
          // density saturates to deep red. Less Gaussian middle-ground.
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(0,0,0,0)',
            0.10, 'rgba(250,204,21,0)',
            0.20, 'rgba(250,204,21,0.40)', // moderate
            0.45, 'rgba(249,115,22,0.65)', // sensitive
            0.70, 'rgba(220,38,38,0.78)',  // unhealthy
            1.0,  'rgba(127,29,29,0.88)',  // hazardous
          ],
          // Smaller radius keeps hot spots distinct rather than uniform
          // citywide tint at low zoom.
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            9,  6,
            10, 9,
            11, 13,
            12, 18,
          ],
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            9,  0.85,
            11, 0.8,
            12, 0,
          ],
        }}
      />
      {/* Block-level squares from zoom 11 onward. Opacity driven by AQI value
       *  itself: clean cells (≤AQI50) stay near-invisible at 0.10, dirty
       *  cells (≥AQI150) ramp to 0.85. This is what gives the map clear
       *  hot vs cold contrast — the eye reads opacity as severity. */}
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
            '*',
            // Zoom factor: fade-in 11→13, full from 13.
            ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 0.6, 13, 1, 16, 1],
            // AQI factor: clean cells faint, dirty cells loud.
            ['interpolate', ['linear'], ['get', 'aqi'],
              0,   0.08,
              50,  0.20,
              100, 0.55,
              150, 0.78,
              200, 0.88,
            ],
          ],
          'fill-antialias': false,
        }}
      />
    </Source>
  );
}
