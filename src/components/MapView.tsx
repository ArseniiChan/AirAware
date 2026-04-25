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
import {
  ClockIcon,
  RulerIcon,
  StepsIcon,
  HazeIcon,
  WindIcon,
  SunIcon,
  MoonIcon,
  SunriseIcon,
  SunsetIcon,
} from '@/components/icons/Icons';

interface Props {
  /** When provided, renders the standard (red) and atlas (green) polylines and
   *  fits the camera to their combined bounds with a cinematic pitch. */
  routes?: DemoRoutesPayload | null;
  /** Per-route exposure stats (slice-aware). Used in the route hover popup. */
  exposure?: RouteOptions | null;
  /** Render the AQI heatmap behind buildings. Off by default. */
  showHeatmap?: boolean;
  /** Fired on long-press / right-click on an empty map area. Mobile browsers
   *  emit contextmenu after ~500ms touch hold; desktop testers use right-click.
   *  Used by the page to drop a destination pin and infer the origin from
   *  the user's current location. */
  onLongPress?: (lon: number, lat: number) => void;
}

const STANDARD_RED = '#ef4444';
const ATLAS_GREEN = '#22c55e';
// Casing flips dark↔light by light preset so polylines never disappear into
// a navy basemap at dusk/night.
const DARK_PRESETS = new Set<LightPreset>(['dusk', 'night']);

const LIGHT_CYCLE: LightPreset[] = ['dawn', 'day', 'dusk', 'night'];
const LIGHT_ICONS: Record<LightPreset, React.ComponentType<{ size?: number }>> = {
  dawn: SunriseIcon,
  day: SunIcon,
  dusk: SunsetIcon,
  night: MoonIcon,
};

type RouteKind = 'standard' | 'atlas';
const ROUTE_LAYER_IDS = ['route-standard-line', 'route-atlas-line'];

export function MapView({ routes = null, exposure = null, showHeatmap = false, onLongPress }: Props) {
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

  const isDarkBasemap = DARK_PRESETS.has(lightPreset);
  // White outline at day/dawn; bright glow ring at dusk/night.
  const casingColor = isDarkBasemap ? '#0f172a' : '#ffffff';
  const casingWidth = isDarkBasemap ? 11 : 9;
  const casingOpacity = isDarkBasemap ? 0.6 : 0.85;

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
        maxPitch={0}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        onLoad={() => setStyleReady(true)}
        onStyleData={() => setStyleReady(true)}
        interactiveLayerIds={ROUTE_LAYER_IDS}
        onMouseMove={onMapMove}
        onMouseLeave={onMapLeave}
        onContextMenu={(e) => {
          if (!onLongPress) return;
          // Right-click on desktop (or cmd-click on Mac), long-touch on
          // mobile. Suppress the browser's native menu so the pin lands cleanly.
          e.preventDefault?.();
          onLongPress(e.lngLat.lng, e.lngLat.lat);
        }}
        cursor={hovered ? 'pointer' : 'grab'}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {showHeatmap && styleReady && <HeatmapLayer />}

        {standardGeoJson && styleReady && (
          <Source id="route-standard" type="geojson" data={standardGeoJson}>
            <Layer
              id="route-standard-casing"
              type="line"
              slot="middle"
              paint={{
                'line-color': casingColor,
                'line-width': casingWidth,
                'line-opacity': casingOpacity,
                'line-blur': isDarkBasemap ? 3 : 0,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-standard-line"
              type="line"
              slot="middle"
              paint={{
                'line-color': STANDARD_RED,
                'line-width': isDarkBasemap ? 6 : 5,
                'line-opacity': 1.0,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </Source>
        )}

        {atlasGeoJson && styleReady && (
          <Source id="route-atlas" type="geojson" data={atlasGeoJson}>
            <Layer
              id="route-atlas-casing"
              type="line"
              slot="middle"
              paint={{
                'line-color': casingColor,
                'line-width': casingWidth,
                'line-opacity': casingOpacity,
                'line-blur': isDarkBasemap ? 3 : 0,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-atlas-line"
              type="line"
              slot="middle"
              paint={{
                'line-color': ATLAS_GREEN,
                'line-width': isDarkBasemap ? 6 : 5,
                'line-opacity': 1.0,
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
              <PinMarker tone="origin" label="Start" />
            </Marker>
            <Marker
              longitude={routes.pair.to.lon}
              latitude={routes.pair.to.lat}
              anchor="bottom"
            >
              <PinMarker tone="destination" label="Target" />
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
              standard={{
                distanceM: routes.routes.standard.distance_m,
                durationS: routes.routes.standard.duration_s,
                exposure: exposure.standard,
              }}
              atlas={{
                distanceM: routes.routes.atlas.distance_m,
                durationS: routes.routes.atlas.duration_s,
                exposure: exposure.atlas,
              }}
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
        {(() => {
          const Icon = LIGHT_ICONS[lightPreset];
          return <Icon size={14} />;
        })()}
        <span className="capitalize">{lightPreset}</span>
      </button>
    </div>
  );
}

// ---------- subcomponents ----------

function PinMarker({ tone, label }: { tone: 'origin' | 'destination'; label: string }) {
  const isOrigin = tone === 'origin';
  const fill = isOrigin ? '#2563eb' : '#dc2626';
  const ring = isOrigin ? 'ring-blue-600/30' : 'ring-red-600/30';
  const icon = isOrigin ? '●' : '★';
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

interface RouteSide {
  distanceM: number;
  durationS: number;
  exposure: RouteOptions['standard'];
}

function RouteHoverCard({
  kind,
  standard,
  atlas,
}: {
  kind: RouteKind;
  standard: RouteSide;
  atlas: RouteSide;
}) {
  const isAtlas = kind === 'atlas';
  const self = isAtlas ? atlas : standard;
  const other = isAtlas ? standard : atlas;
  const otherLabel = isAtlas ? 'Standard' : 'AirAware';
  const steps = estimateSteps(self.distanceM, self.durationS / 60);

  // Avg AQI is the fair air-quality metric (per-step concentration). Total
  // bad-air minutes scales with walk length, so a longer cleaner route can
  // still show more total minutes — that's misleading without context.
  const avgDelta = self.exposure.avgAqi - other.exposure.avgAqi;
  const badAirDelta = self.exposure.exposureMinutes - other.exposure.exposureMinutes;

  function deltaTag(value: number, unit: string, lowerIsBetter = true) {
    if (Math.abs(value) < 0.5) {
      return <span className="text-slate-400">≈ {otherLabel}</span>;
    }
    const better = lowerIsBetter ? value < 0 : value > 0;
    const cls = better ? 'text-emerald-600' : 'text-rose-600';
    const arrow = value < 0 ? '↓' : '↑';
    const abs = Math.abs(value);
    const display = unit === 'min' ? abs.toFixed(1) : Math.round(abs);
    return (
      <span className={cls}>
        {arrow}{display}{unit} vs {otherLabel}
      </span>
    );
  }

  return (
    <div className="min-w-[200px] space-y-1.5 px-1 py-0.5 text-[11px] text-slate-900">
      <div className="flex items-center gap-1.5 font-bold">
        <span
          className={`inline-block h-2 w-2 rounded-full ${isAtlas ? 'bg-emerald-600' : 'bg-red-600'}`}
        />
        {isAtlas ? 'AirAware route' : 'Standard route'}
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-slate-700">
        <span className="inline-flex items-center gap-1.5"><ClockIcon size={12} /> Walk</span>
        <span className="text-right font-semibold">{formatWalkTime(self.durationS)}</span>
        <span className="inline-flex items-center gap-1.5"><RulerIcon size={12} /> Distance</span>
        <span className="text-right font-semibold">{formatDistance(self.distanceM)}</span>
        <span className="inline-flex items-center gap-1.5"><StepsIcon size={12} /> Steps</span>
        <span className="text-right font-semibold">~{steps.toLocaleString()}</span>
      </div>

      <div className="space-y-0.5 border-t border-slate-200 pt-1.5 text-[10.5px]">
        <div className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-2">
          <span className="inline-flex items-center gap-1.5 text-slate-700"><HazeIcon size={12} /> Avg AQI</span>
          <span className="text-right font-bold text-slate-900">{Math.round(self.exposure.avgAqi)}</span>
          <span className="text-right">{deltaTag(avgDelta, '', true)}</span>
        </div>
        <div className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-2">
          <span className="inline-flex items-center gap-1.5 text-slate-700"><WindIcon size={12} /> Bad air</span>
          <span className="text-right font-bold text-slate-900">{self.exposure.exposureMinutes.toFixed(1)} min</span>
          <span className="text-right">{deltaTag(badAirDelta, ' min', true)}</span>
        </div>
      </div>
    </div>
  );
}
