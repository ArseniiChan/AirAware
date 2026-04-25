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

  // Reference: NYCCAS PM2.5 annual-average map (NYC DOHMH). The whole city
  // is colored — Staten Island light orange, outer boroughs deeper orange,
  // Manhattan + Bronx deep red, with major arterials burning through as
  // red threads. We render that with a single polygon fill layer at ALL
  // zooms — every grid cell shows its own AQI color. No heatmap kernel
  // (those produced isolated red dots and a city-wide blob).
  return (
    <Source id="aqi-heatmap" type="geojson" data={data} buffer={32}>
      <Layer
        id="aqi-cells-fill"
        type="fill"
        slot="bottom"
        paint={{
          // Continuous hue ramp — 16 stops so every AQI integer maps to its
          // own visibly distinct shade, not just band buckets.
          'fill-color': [
            'interpolate', ['linear'], ['get', 'aqi'],
             0,   '#bbf7d0', // good — pale mint
            25,   '#86efac', // good
            45,   '#bef264', // good-moderate
            60,   '#fde047', // moderate (yellow)
            75,   '#facc15',
            90,   '#fbbf24', // gold
           105,   '#f59e0b',
           120,   '#fb923c', // sensitive (orange)
           135,   '#f97316',
           150,   '#ef4444', // unhealthy (red)
           165,   '#dc2626',
           180,   '#b91c1c',
           200,   '#991b1b',
           230,   '#7f1d1d', // very unhealthy
           280,   '#65141d',
           340,   '#4c0519', // hazardous
          ],
          // Steep AQI-driven opacity — clean blocks fade into the basemap,
          // dirty blocks dominate. No floor (avoids the citywide tint that
          // smeared into Bronx + Manhattan looking the same).
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
