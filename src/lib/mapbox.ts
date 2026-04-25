// Mapbox config + NYC geographic constants used across map, geocoder, and routing.

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

// Mapbox Standard (v3, 2024) — realistic 3D buildings, dynamic lighting via
// `lightPreset` config property, automatic layer slotting. We pitch the
// camera to show off the 3D building shells at city zoom levels.
export const MAP_STYLE = 'mapbox://styles/mapbox/standard';

// Bronx-anchored initial camera. Hunts Point sits near (-73.88, 40.81); we
// pull back a click so the storyteller's school + home are both in view at z11.
export const BRONX_CENTER = { longitude: -73.87, latitude: 40.84 } as const;
export const INITIAL_ZOOM = 11;

// Top-down camera at all times so the heatmap and route comparison read
// cleanly without parallax distortion.
export const RESULTS_PITCH = 0;
export const RESULTS_BEARING = 0;

// Standard's lightPreset controls sun position + sky tinting + window glow.
// 'day' is the safest demo default; 'dusk' is more cinematic but tints
// everything orange which fights our heatmap. We expose all four so a future
// toggle can cycle them.
export type LightPreset = 'dawn' | 'day' | 'dusk' | 'night';
export const DEFAULT_LIGHT_PRESET: LightPreset = 'day';

// 5-borough bounding box (W,S,E,N). Used to clamp the geocoder so judges
// who type "Atlanta" get the friendly out-of-NYC fallback instead of a hit.
export const NYC_BBOX: [number, number, number, number] = [-74.27, 40.49, -73.68, 40.92];

// Bronx proximity bias — geocoder ranks results near this point higher, so
// "PS 48" surfaces the Bronx school first.
export const BRONX_PROXIMITY: [number, number] = [-73.87, 40.84];
