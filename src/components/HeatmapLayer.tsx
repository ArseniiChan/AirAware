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

  // Reference: NYCCAS PM2.5 annual-average map (NYC DOHMH). Yellow-orange
  // for clean outer boroughs, deep red for industrial corridors, with
  // highway lines burning through as visible red threads. Our heatmap
  // should read the same way.
  //
  //  1. Heatmap (zoom < 11.5): TIGHT radius + AQI ≥ 100 threshold so hot
  //     spots burn through but the rest of the city stays neutral basemap.
  //     The prior tuning saturated the entire bbox into one tint because
  //     every cell contributed a wide kernel.
  //
  //  2. Polygon fills (zoom >= 11): primary visualization. Steep AQI-driven
  //     opacity — clean cells transparent (basemap shows through), dirty
  //     cells near-saturated. NO zoom-based fade — full strength once
  //     minzoom is hit, all the way to max zoom.
  return (
    <Source id="aqi-heatmap" type="geojson" data={data} buffer={32}>
      <Layer
        id="aqi-heatmap-layer"
        type="heatmap"
        slot="bottom"
        maxzoom={11.5}
        paint={{
          // Only AQI ≥ 100 contributes. Moderate cells stay invisible so
          // we don't get a citywide red blob.
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'aqi'],
            100, 0,
            125, 0.30,
            150, 0.60,
            180, 0.85,
            220, 1.0,
          ],
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            9,  0.7,
            11, 1.0,
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(0,0,0,0)',
            0.15, 'rgba(0,0,0,0)',
            0.30, 'rgba(249,115,22,0.50)',
            0.60, 'rgba(220,38,38,0.70)',
            1.0,  'rgba(127,29,29,0.85)',
          ],
          // TIGHT radius — kernels stay small so neighbors don't merge into
          // one tint at low zoom.
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            9,  3,
            10, 5,
            11, 8,
          ],
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            9,  0.55,
            11, 0.5,
            11.5, 0,
          ],
        }}
      />
      {/* Block-level squares: the primary viz at zoom 11+. Steep
       *  AQI-driven opacity creates the visible contrast. */}
      <Layer
        id="aqi-cells-fill"
        type="fill"
        slot="bottom"
        minzoom={11}
        paint={{
          'fill-color': [
            'interpolate', ['linear'], ['get', 'aqi'],
             0,   '#fef9c3', // good (very pale yellow)
            55,   '#fde047', // moderate (yellow)
            85,   '#facc15', // moderate (gold)
           110,   '#fb923c', // sensitive (orange)
           135,   '#ef4444', // unhealthy (red)
           165,   '#b91c1c', // very unhealthy (deep red)
           220,   '#7f1d1d', // hazardous (dark red)
          ],
          // STEEP opacity curve drives the contrast. Clean (≤55) is barely
          // visible; sensitive (110) hits 0.55; unhealthy (135+) saturates
          // past 0.80 — corridors will burn through visibly.
          'fill-opacity': [
            'interpolate', ['linear'], ['get', 'aqi'],
            0,    0.0,
            45,   0.05,
            65,   0.18,
            85,   0.35,
            105,  0.55,
            125,  0.72,
            150,  0.85,
            200,  0.92,
          ],
          'fill-antialias': false,
        }}
      />
    </Source>
  );
}
