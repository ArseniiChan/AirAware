'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapRef,
  type MapLayerMouseEvent,
} from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MAPBOX_TOKEN,
  MAP_STYLE,
  BRONX_CENTER,
  INITIAL_ZOOM,
  NYC_BBOX,
  RESULTS_PITCH,
  RESULTS_BEARING,
  DEFAULT_LIGHT_PRESET,
  type LightPreset,
} from '@/lib/mapbox';
import type { DemoRoutesPayload } from '@/lib/routesData';
import { HeatmapLayer } from './HeatmapLayer';
import { formatDistance, formatWalkTime, estimateSteps } from '@/lib/healthMath';
import type { RouteOptions } from '@/lib/recommendation';

interface Props {
  /** When provided, renders the standard (red) and atlas (green) polylines and
   *  fits the camera to their combined bounds with a cinematic pitch. */
  routes?: DemoRoutesPayload | null;
  /** Per-route exposure stats (slice-aware). Used in the route hover popup. */
  exposure?: RouteOptions | null;
  /** Render the AQI heatmap behind buildings. Off by default. */
  showHeatmap?: boolean;
}

const STANDARD_RED = '#dc2626';
const ATLAS_GREEN = '#16a34a';

const LIGHT_CYCLE: LightPreset[] = ['dawn', 'day', 'dusk', 'night'];
const LIGHT_LABEL: Record<LightPreset, string> = {
  dawn: '🌅', day: '☀️', dusk: '🌆', night: '🌙',
};

type RouteKind = 'standard' | 'atlas';
const ROUTE_LAYER_IDS = ['route-standard-line', 'route-atlas-line'];

export function MapView({ routes = null, exposure = null, showHeatmap = false }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [lightPreset, setLightPreset] = useState<LightPreset>(DEFAULT_LIGHT_PRESET);
  const [hovered, setHovered] = useState<{
    kind: RouteKind;
    lon: number;
    lat: number;
  } | null>(null);

  function onMapMove(e: MapLayerMouseEvent) {
    const f = e.features?.[0];
    if (!f) { setHovered(null); return; }
    const kind: RouteKind = f.layer?.id === 'route-atlas-line' ? 'atlas' : 'standard';
    setHovered({ kind, lon: e.lngLat.lng, lat: e.lngLat.lat });
  }
  function onMapLeave() { setHovered(null); }

  // Apply Standard's lightPreset config whenever the style is ready or the
  // user cycles it. setConfigProperty is the v3 API for live theme switching.
  useEffect(() => {
    if (!styleReady || !mapRef.current) return;
    try {
      mapRef.current.getMap().setConfigProperty('basemap', 'lightPreset', lightPreset);
    } catch {
      // Older mapbox-gl versions may not expose setConfigProperty; degrade silently.
    }
  }, [styleReady, lightPreset]);

  const standardGeoJson = useMemo(() => {
    if (!routes) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: routes.routes.standard.geometry,
    };
  }, [routes]);

  const atlasGeoJson = useMemo(() => {
    if (!routes) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: routes.routes.atlas.geometry,
    };
  }, [routes]);

  // Fly the camera to route bounds with a cinematic pitch + bearing the moment
  // routes appear. Easing the camera (instead of jump-fitting) is the single
  // biggest "this feels like a real product" upgrade.
  useEffect(() => {
    if (!routes || !mapRef.current || !styleReady) return;
    const all = [
      ...routes.routes.standard.geometry.coordinates,
      ...routes.routes.atlas.geometry.coordinates,
    ];
    if (all.length === 0) return;
    let minLon = all[0][0], maxLon = all[0][0];
    let minLat = all[0][1], maxLat = all[0][1];
    for (const [lon, lat] of all) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const map = mapRef.current.getMap();
    const camera = map.cameraForBounds(
      [[minLon, minLat], [maxLon, maxLat]],
      { padding: 64, maxZoom: 16.5 },
    );
    if (!camera || !camera.center) return;
    map.flyTo({
      center: camera.center,
      zoom: typeof camera.zoom === 'number' ? camera.zoom : INITIAL_ZOOM,
      pitch: RESULTS_PITCH,
      bearing: RESULTS_BEARING,
      duration: 1600,
      essential: true,
      curve: 1.4,
    });
  }, [routes, styleReady]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 p-6 text-center text-sm text-gray-600">
        Missing <code className="mx-1 rounded bg-gray-200 px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code>.
        Add one to <code className="mx-1 rounded bg-gray-200 px-1">.env.local</code> and restart.
      </div>
    );
  }

  function cycleLight() {
    const i = LIGHT_CYCLE.indexOf(lightPreset);
    setLightPreset(LIGHT_CYCLE[(i + 1) % LIGHT_CYCLE.length]);
  }

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAP_STYLE}
        initialViewState={{
          longitude: BRONX_CENTER.longitude,
          latitude: BRONX_CENTER.latitude,
          zoom: INITIAL_ZOOM,
          pitch: 0,
          bearing: 0,
        }}
        maxBounds={NYC_BBOX}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        onLoad={() => setStyleReady(true)}
        onStyleData={() => setStyleReady(true)}
        interactiveLayerIds={ROUTE_LAYER_IDS}
        onMouseMove={onMapMove}
        onMouseLeave={onMapLeave}
        cursor={hovered ? 'pointer' : 'grab'}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {showHeatmap && <HeatmapLayer />}

        {standardGeoJson && (
          <Source id="route-standard" type="geojson" data={standardGeoJson}>
            <Layer
              id="route-standard-casing"
              type="line"
              slot="middle"
              paint={{
                'line-color': '#ffffff',
                'line-width': 9,
                'line-opacity': 0.85,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-standard-line"
              type="line"
              slot="middle"
              paint={{
                'line-color': STANDARD_RED,
                'line-width': 5,
                'line-opacity': 0.95,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </Source>
        )}

        {atlasGeoJson && (
          <Source id="route-atlas" type="geojson" data={atlasGeoJson}>
            <Layer
              id="route-atlas-casing"
              type="line"
              slot="middle"
              paint={{
                'line-color': '#ffffff',
                'line-width': 9,
                'line-opacity': 0.85,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-atlas-line"
              type="line"
              slot="middle"
              paint={{
                'line-color': ATLAS_GREEN,
                'line-width': 5,
                'line-opacity': 0.95,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </Source>
        )}

        {routes && (
          <>
            <Marker
              longitude={routes.pair.from.lon}
              latitude={routes.pair.from.lat}
              anchor="bottom"
            >
              <PinMarker tone="origin" label="Home" />
            </Marker>
            <Marker
              longitude={routes.pair.to.lon}
              latitude={routes.pair.to.lat}
              anchor="bottom"
            >
              <PinMarker tone="destination" label="School" />
            </Marker>
          </>
        )}

        {hovered && routes && exposure && (
          <Popup
            longitude={hovered.lon}
            latitude={hovered.lat}
            anchor="bottom"
            offset={14}
            closeButton={false}
            closeOnClick={false}
            className="airaware-popup"
          >
            <RouteHoverCard
              kind={hovered.kind}
              distanceM={hovered.kind === 'standard' ? routes.routes.standard.distance_m : routes.routes.atlas.distance_m}
              durationS={hovered.kind === 'standard' ? routes.routes.standard.duration_s : routes.routes.atlas.duration_s}
              exposure={hovered.kind === 'standard' ? exposure.standard : exposure.atlas}
            />
          </Popup>
        )}
      </Map>

      <button
        type="button"
        onClick={cycleLight}
        className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur transition hover:bg-slate-900"
        aria-label={`Lighting: ${lightPreset}. Tap to cycle.`}
      >
        <span aria-hidden>{LIGHT_LABEL[lightPreset]}</span>
        <span className="capitalize">{lightPreset}</span>
      </button>
    </div>
  );
}

// ---------- subcomponents ----------

function PinMarker({ tone, label }: { tone: 'origin' | 'destination'; label: string }) {
  const isOrigin = tone === 'origin';
  const fill = isOrigin ? '#0f172a' : '#16a34a';
  const ring = isOrigin ? 'ring-slate-900/30' : 'ring-emerald-500/40';
  const icon = isOrigin ? '🏠' : '🏫';
  return (
    <div className="flex flex-col items-center" style={{ pointerEvents: 'none' }}>
      <span
        className={`mb-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900 shadow ring-1 ${ring}`}
      >
        {label}
      </span>
      {/* SVG pin: round head + tail point. anchor="bottom" so the tip sits on the coord. */}
      <svg width="30" height="40" viewBox="0 0 30 40" aria-label={label}>
        <defs>
          <filter id={`pin-shadow-${tone}`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.4" />
          </filter>
        </defs>
        <path
          d="M15 0 C 6.7 0 0 6.7 0 15 C 0 25 15 40 15 40 C 15 40 30 25 30 15 C 30 6.7 23.3 0 15 0 Z"
          fill={fill}
          stroke="#ffffff"
          strokeWidth="2.5"
          filter={`url(#pin-shadow-${tone})`}
        />
        <text
          x="15"
          y="20"
          textAnchor="middle"
          fontSize="14"
          dominantBaseline="middle"
        >
          {icon}
        </text>
      </svg>
    </div>
  );
}

function RouteHoverCard({
  kind,
  distanceM,
  durationS,
  exposure,
}: {
  kind: RouteKind;
  distanceM: number;
  durationS: number;
  exposure: RouteOptions['standard'];
}) {
  const isAtlas = kind === 'atlas';
  const steps = estimateSteps(distanceM, durationS / 60);
  return (
    <div className="min-w-[160px] space-y-1.5 px-1 py-0.5 text-[11px] text-slate-900">
      <div className="flex items-center gap-1.5 font-bold">
        <span
          className={`inline-block h-2 w-2 rounded-full ${isAtlas ? 'bg-emerald-600' : 'bg-red-600'}`}
        />
        {isAtlas ? 'AirAware route' : 'Standard route'}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-700">
        <span>⏱️ Walk</span>
        <span className="text-right font-semibold">{formatWalkTime(durationS)}</span>
        <span>📏 Distance</span>
        <span className="text-right font-semibold">{formatDistance(distanceM)}</span>
        <span>👟 Steps</span>
        <span className="text-right font-semibold">~{steps.toLocaleString()}</span>
        <span>🌬️ Bad air</span>
        <span className="text-right font-semibold">{exposure.exposureMinutes} min</span>
      </div>
    </div>
  );
}
