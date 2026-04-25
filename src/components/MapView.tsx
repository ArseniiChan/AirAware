'use client';

import { useEffect, useMemo, useRef } from 'react';
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MAPBOX_TOKEN,
  MAP_STYLE,
  BRONX_CENTER,
  INITIAL_ZOOM,
  NYC_BBOX,
} from '@/lib/mapbox';
import type { DemoRoutesPayload } from '@/lib/routesData';

interface Props {
  /** When provided, renders the standard (red) and atlas (green) polylines and
   *  fits the camera to their combined bounds. */
  routes?: DemoRoutesPayload | null;
}

const STANDARD_RED = '#dc2626';
const ATLAS_GREEN = '#16a34a';

export function MapView({ routes = null }: Props) {
  const mapRef = useRef<MapRef | null>(null);

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

  // Auto-fit camera when routes appear.
  useEffect(() => {
    if (!routes || !mapRef.current) return;
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
    mapRef.current.getMap().fitBounds(
      [[minLon, minLat], [maxLon, maxLat]],
      { padding: 56, duration: 800, maxZoom: 16 },
    );
  }, [routes]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 p-6 text-center text-sm text-gray-600">
        Missing <code className="mx-1 rounded bg-gray-200 px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code>.
        Add one to <code className="mx-1 rounded bg-gray-200 px-1">.env.local</code> and restart.
      </div>
    );
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle={MAP_STYLE}
      initialViewState={{
        longitude: BRONX_CENTER.longitude,
        latitude: BRONX_CENTER.latitude,
        zoom: INITIAL_ZOOM,
      }}
      maxBounds={NYC_BBOX}
      style={{ width: '100%', height: '100%' }}
      attributionControl={false}
    >
      <NavigationControl position="top-right" showCompass={false} />

      {standardGeoJson && (
        <Source id="route-standard" type="geojson" data={standardGeoJson}>
          {/* White casing so the red pops on any basemap color */}
          <Layer
            id="route-standard-casing"
            type="line"
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
            paint={{
              'line-color': ATLAS_GREEN,
              'line-width': 5,
              'line-opacity': 0.95,
              'line-dasharray': [1, 0], // solid; dashed reserved for "brief walk" later
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
              className="h-3.5 w-3.5 rounded-full border-2 border-white bg-slate-900 shadow"
            />
          </Marker>
          <Marker longitude={routes.pair.to.lon} latitude={routes.pair.to.lat} anchor="center">
            <div
              aria-label="Destination"
              className="h-4 w-4 rounded-full border-2 border-white bg-emerald-600 shadow"
            />
          </Marker>
        </>
      )}
    </Map>
  );
}
