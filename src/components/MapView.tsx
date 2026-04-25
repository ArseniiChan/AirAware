'use client';

import Map, { NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MAPBOX_TOKEN,
  MAP_STYLE,
  BRONX_CENTER,
  INITIAL_ZOOM,
  NYC_BBOX,
} from '@/lib/mapbox';

export function MapView() {
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
    </Map>
  );
}
