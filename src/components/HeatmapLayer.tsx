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

  // Two layers — restored to the state it was in at the prompt the user
  // referenced ("only northern NYC colored / red dots / variance"):
  //
  //  1. Heatmap (zoom < 12): only cells AQI >= 70 contribute, kernels stay
  //     small so hot spots are distinct rather than smearing.
  //  2. Polygon fill (zoom >= 11): each grid cell's actual 200m square,
  //     opacity driven by AQI so clean blocks fade into the basemap and
  //     dirty blocks dominate.
  return (
    <Source id="aqi-heatmap" type="geojson" data={data} buffer={32}>
      <Layer
        id="aqi-heatmap-layer"
        type="heatmap"
        slot="bottom"
        maxzoom={12}
        paint={{
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'aqi'],
            70, 0,
            90, 0.25,
            120, 0.55,
            160, 0.85,
            200, 1.0,
          ],
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            9, 0.8,
            11, 1.1,
            12, 1.4,
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(0,0,0,0)',
            0.10, 'rgba(250,204,21,0)',
            0.20, 'rgba(250,204,21,0.40)',
            0.45, 'rgba(249,115,22,0.65)',
            0.70, 'rgba(220,38,38,0.78)',
            1.0,  'rgba(127,29,29,0.88)',
          ],
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            9, 6,
            10, 9,
            11, 13,
            12, 18,
          ],
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            9, 0.85,
            11, 0.8,
            12, 0,
          ],
        }}
      />
      <Layer
        id="aqi-cells-fill"
        type="fill"
        slot="bottom"
        minzoom={11}
        paint={{
          'fill-color': [
            'interpolate', ['linear'], ['get', 'aqi'],
             0,   '#86efac',
            50,   '#fde047',
           100,   '#fb923c',
           150,   '#ef4444',
           200,   '#7f1d1d',
          ],
          'fill-opacity': [
            '*',
            ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 0.6, 13, 1, 16, 1],
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
