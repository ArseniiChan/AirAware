// Mapbox config + NYC geographic constants used across map, geocoder, and routing.

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

// Light basemap; per plan we don't ship a custom Studio style.
export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';

// Bronx-anchored initial camera. Hunts Point sits near (-73.88, 40.81); we
// pull back a click so the storyteller's school + home are both in view at z11.
export const BRONX_CENTER = { longitude: -73.87, latitude: 40.84 } as const;
export const INITIAL_ZOOM = 11;

// 5-borough bounding box (W,S,E,N). Used to clamp the geocoder so judges
// who type "Atlanta" get the friendly out-of-NYC fallback instead of a hit.
export const NYC_BBOX: [number, number, number, number] = [-74.27, 40.49, -73.68, 40.92];

// Bronx proximity bias — geocoder ranks results near this point higher, so
// "PS 48" surfaces the Bronx school first.
export const BRONX_PROXIMITY: [number, number] = [-73.87, 40.84];
