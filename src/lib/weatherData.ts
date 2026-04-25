// Read public/data/weather.json (Person C, Open-Meteo) and surface a short
// "feels like" line keyed to the current TimeScrubber slice. The point is to
// give a CAUSE for Maya's 4pm flip — Council's Outsider feedback was that the
// scrubber looks arbitrary unless judges can read why the air clears.

import type { TimeSlice } from '@/components/TimeScrubber';

interface WeatherHour {
  hour_offset: number;
  temp_f: number;
  wind_mph: number;
  humidity: number;
}

interface WeatherFile {
  schema_version: number;
  generated_at: string;
  source: string;
  centroid: [number, number];
  hourly: WeatherHour[];
}

let cache: WeatherFile | null = null;
let inflight: Promise<WeatherFile> | null = null;

export async function loadWeather(): Promise<WeatherFile> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch('/data/weather.json', { cache: 'force-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`weather load: ${r.status}`);
        return r.json() as Promise<WeatherFile>;
      })
      .then((w) => { cache = w; return w; });
  }
  return inflight;
}

// NYC-local target hours per slice — same heuristic as forecastScaling.
const NYC_UTC_OFFSET_HOURS = -4;
const SLICE_TARGET_LOCAL_HOUR: Record<TimeSlice, number | 'tomorrow_morning' | 'now'> = {
  now: 'now',
  noon: 12,
  afternoon: 16,
  evening: 18,
  tomorrow: 'tomorrow_morning',
};

export function weatherForSlice(
  weather: WeatherFile,
  slice: TimeSlice,
): WeatherHour | null {
  const hourly = weather.hourly;
  if (!hourly?.length) return null;
  if (slice === 'now') return hourly[0];

  const target = SLICE_TARGET_LOCAL_HOUR[slice];
  const gen = new Date(weather.generated_at);
  if (Number.isNaN(gen.getTime())) return hourly[0];

  const targetDate = new Date(gen);
  if (target === 'tomorrow_morning') {
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    targetDate.setUTCHours(8 - NYC_UTC_OFFSET_HOURS, 0, 0, 0);
  } else if (typeof target === 'number') {
    const targetUtcHours = target - NYC_UTC_OFFSET_HOURS;
    targetDate.setUTCHours(targetUtcHours, 0, 0, 0);
    if (targetDate.getTime() <= gen.getTime()) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }
  } else {
    return hourly[0];
  }

  const targetOffsetH = Math.round((targetDate.getTime() - gen.getTime()) / 3_600_000);
  const clamped = Math.max(0, Math.min(hourly.length - 1, targetOffsetH));
  return hourly[clamped] ?? hourly[0];
}

export interface WeatherCaption {
  primary: string;   // "44°F · 8 mph wind"
  causal?: string;   // "Rush hour traffic clears by 4 PM"
}

/** Build a short caption combining slice-specific weather + a causal hint
 *  for the demo flip moments. */
export function captionForSlice(
  weather: WeatherFile,
  slice: TimeSlice,
): WeatherCaption | null {
  const w = weatherForSlice(weather, slice);
  if (!w) return null;
  const primary = `${Math.round(w.temp_f)}°F · ${Math.round(w.wind_mph)} mph wind`;
  let causal: string | undefined;
  switch (slice) {
    case 'now':
      causal = 'Morning rush — bus depot peaks until ~10 AM';
      break;
    case 'noon':
      causal = 'Mid-day lull — traffic easing';
      break;
    case 'afternoon':
      // The hero flip moment.
      causal = 'Air clears as wind rises and rush-hour traffic ends';
      break;
    case 'evening':
      causal = 'Evening rush — depot back to peak';
      break;
    case 'tomorrow':
      causal = 'Forecast: cleaner morning ahead';
      break;
  }
  return { primary, causal };
}
