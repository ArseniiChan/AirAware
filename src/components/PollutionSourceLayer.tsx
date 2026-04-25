'use client';

// Renders the hand-curated pollution sources (bus depots, highway hot spots,
// industrial zones) from public/data/pollution-sources.json as faint colored
// halos over the basemap. Lets judges SEE why a particular block reads hot
// — the route bending around the Hunts Point bus depot is much more
// persuasive when the depot has a visible glow under it.

import { useEffect, useState } from 'react';
import { Layer, Marker, Source } from 'react-map-gl';

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

let cache: PollutionFile | null = null;
let inflight: Promise<PollutionFile> | null = null;

async function loadSources(): Promise<PollutionFile> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch('/data/pollution-sources.json', { cache: 'force-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`pollution sources: ${r.status}`);
        return r.json() as Promise<PollutionFile>;
      })
      .then((p) => { cache = p; return p; });
  }
  return inflight;
}

const TYPE_LABEL: Record<string, string> = {
  bus_depot: 'Bus depot',
  highway_segment: 'Highway',
  industrial_zone: 'Industrial',
  power_plant: 'Power plant',
  airport: 'Airport',
};

interface Props {
  /** Show small labels at zoom >= 13. Off by default — too noisy on the
   *  citywide overview. */
  showLabels?: boolean;
}

export function PollutionSourceLayer({ showLabels = true }: Props) {
  const [sources, setSources] = useState<PollutionSource[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSources()
      .then((p) => { if (!cancelled) setSources(p.sources); })
      .catch((err) => { console.error('pollution sources load failed', err); });
    return () => { cancelled = true; };
  }, []);

  if (!sources) return null;

  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: sources.map((s, i) => ({
      type: 'Feature',
      id: i,
      properties: {
        name: s.name,
        type: s.type,
        max_penalty: s.max_penalty,
        sigma_m: s.sigma_m,
        // Outer halo radius scales loosely with the Gaussian's sigma so the
        // glow visually approximates the model's reach.
        halo_m: Math.min(450, Math.round(s.sigma_m * 1.6)),
      },
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    })),
  };

  return (
    <>
      <Source id="pollution-sources" type="geojson" data={fc}>
        {/* Soft outer halo. Uses circle-radius computed from feature's halo_m
            converted to pixels at the current zoom. We approximate the
            metric→pixel conversion using mapbox's `interpolate` with `zoom`
            to keep the halo proportional to real-world distance. */}
        <Layer
          id="pollution-halo"
          type="circle"
          slot="bottom"
          paint={{
            'circle-color': [
              'match', ['get', 'type'],
              'bus_depot',       '#f97316',
              'highway_segment', '#ef4444',
              'industrial_zone', '#7f1d1d',
              'power_plant',     '#7f1d1d',
              'airport',         '#dc2626',
              /* default */      '#f97316',
            ],
            'circle-radius': [
              'interpolate', ['exponential', 2], ['zoom'],
              10, ['/', ['get', 'halo_m'], 60],
              13, ['/', ['get', 'halo_m'], 12],
              16, ['/', ['get', 'halo_m'], 2],
            ],
            'circle-opacity': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.18,
              13, 0.28,
              15, 0.32,
            ],
            'circle-blur': 0.85,
          }}
        />

        {/* Inner core dot — clearly marks the centroid of the source. */}
        <Layer
          id="pollution-core"
          type="circle"
          slot="middle"
          paint={{
            'circle-color': [
              'match', ['get', 'type'],
              'bus_depot',       '#c2410c',
              'highway_segment', '#b91c1c',
              'industrial_zone', '#7f1d1d',
              'power_plant',     '#7f1d1d',
              'airport',         '#b91c1c',
              /* default */      '#c2410c',
            ],
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              11, 3,
              14, 5,
              16, 7,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
            'circle-opacity': 0.95,
          }}
        />
      </Source>

      {/* Hover-style labels using DOM markers (cheap, only 11 of them). They
          fade out at low zoom to avoid clutter. */}
      {showLabels &&
        sources.map((s, i) => (
          <Marker
            key={i}
            longitude={s.lon}
            latitude={s.lat}
            anchor="top"
            offset={[0, 8]}
          >
            <div
              className="pointer-events-none whitespace-nowrap rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur"
              style={{ transform: 'translateY(0)' }}
            >
              {TYPE_LABEL[s.type] ?? s.type}
            </div>
          </Marker>
        ))}
    </>
  );
}
