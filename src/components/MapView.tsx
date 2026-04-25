'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from 'react-map-gl';
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

interface Props {
  /** When provided, renders the standard (red) and atlas (green) polylines and
   *  fits the camera to their combined bounds with a cinematic pitch. */
  routes?: DemoRoutesPayload | null;
  /** Render the AQI heatmap behind buildings. Off by default. */
  showHeatmap?: boolean;
}

const STANDARD_RED = '#dc2626';
const ATLAS_GREEN = '#16a34a';

const LIGHT_CYCLE: LightPreset[] = ['dawn', 'day', 'dusk', 'night'];
const LIGHT_LABEL: Record<LightPreset, string> = {
  dawn: '🌅', day: '☀️', dusk: '🌆', night: '🌙',
};

export function MapView({ routes = null, showHeatmap = false }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [lightPreset, setLightPreset] = useState<LightPreset>(DEFAULT_LIGHT_PRESET);

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
            <Marker longitude={routes.pair.from.lon} latitude={routes.pair.from.lat} anchor="center">
              <div
                aria-label="Origin"
                className="h-3.5 w-3.5 rounded-full border-2 border-white bg-slate-900 shadow-[0_4px_14px_rgba(0,0,0,0.4)]"
              />
            </Marker>
            <Marker longitude={routes.pair.to.lon} latitude={routes.pair.to.lat} anchor="center">
              <div
                aria-label="Destination"
                className="h-4 w-4 rounded-full border-2 border-white bg-emerald-600 shadow-[0_4px_14px_rgba(22,163,74,0.55)]"
              />
            </Marker>
          </>
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
