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

  // Restored to the visual state at commit 176755b (4:37pm 2026-04-25),
  // which the user identified as "good around 4:40pm". Single polygon
  // fill at all zooms, floor opacity so the whole city is tinted, 8-stop
  // amber→deep-red ramp.
  return (
    <Source id="aqi-heatmap" type="geojson" data={data} buffer={32}>
      <Layer
        id="aqi-cells-fill"
        type="fill"
        slot="bottom"
        paint={{
          'fill-color': [
            'interpolate', ['linear'], ['get', 'aqi'],
             0,   '#fde68a', // pale amber — even clean cells get a tint
            40,   '#fcd34d', // soft yellow
            70,   '#fbbf24', // gold
            95,   '#fb923c', // orange (sensitive)
           120,   '#f97316', // dark orange
           140,   '#ef4444', // red (unhealthy)
           165,   '#dc2626', // dark red
           200,   '#7f1d1d', // hazardous
          ],
          // Floor opacity 0.32 so the cleanest blocks are still visibly
          // tinted (NYCCAS-style — no transparent gaps). Steep ramp through
          // the middle so contrast is loud where it matters.
          'fill-opacity': [
            'interpolate', ['linear'], ['get', 'aqi'],
            0,    0.32,
            40,   0.40,
            70,   0.52,
            95,   0.65,
            120,  0.78,
            140,  0.86,
            180,  0.92,
          ],
          'fill-antialias': false,
        }}
      />
    </Source>
  );
}
