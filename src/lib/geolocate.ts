// Browser geolocation → reverse-geocode via Mapbox → AddressPick.
//
// Demo-day rules: we NEVER auto-prompt. Only fires behind an explicit user tap
// on the "Use my location" chip. If permission is denied or geocoding fails
// we surface a friendly message in the caller, not a console error.

import type { AddressPick } from '@/components/AddressAutocomplete';
import { MAPBOX_TOKEN, NYC_BBOX } from './mapbox';

interface GeocodeFeature {
  place_name: string;
  text: string;
  center: [number, number];
  context?: { id: string; text: string }[];
  properties?: { postcode?: string };
}

function zctaFromFeature(f: GeocodeFeature): string | undefined {
  const ctxZip = f.context?.find((c) => c.id?.startsWith('postcode'))?.text;
  return ctxZip ?? f.properties?.postcode;
}

export class GeolocateError extends Error {
  code: 'denied' | 'unavailable' | 'timeout' | 'outside_nyc' | 'no_token' | 'reverse_failed';
  constructor(code: GeolocateError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocateError('unavailable', 'Geolocation not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new GeolocateError('denied', 'Location permission was denied.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new GeolocateError('timeout', 'Couldn\'t fix your location in time.'));
        } else {
          reject(new GeolocateError('unavailable', 'Location unavailable.'));
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export async function locateMe(): Promise<AddressPick> {
  if (!MAPBOX_TOKEN) {
    throw new GeolocateError('no_token', 'Map token missing.');
  }
  const pos = await getPosition();
  const lon = pos.coords.longitude;
  const lat = pos.coords.latitude;

  const [w, s, e, n] = NYC_BBOX;
  if (lon < w || lon > e || lat < s || lat > n) {
    throw new GeolocateError(
      'outside_nyc',
      'You appear to be outside NYC. Pick a Bronx address to demo.',
    );
  }

  // Reverse-geocode for a friendly name + ZCTA.
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json` +
    `?types=address,poi,place,postcode&limit=1&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new GeolocateError('reverse_failed', 'Could not look up your address.');
  }
  const json = (await res.json()) as { features?: GeocodeFeature[] };
  const feat = json.features?.[0];
  return {
    name: feat?.place_name ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    lon,
    lat,
    zcta: feat ? zctaFromFeature(feat) : undefined,
  };
}
