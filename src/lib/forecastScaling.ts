// Time-scrubber forecast wiring — the seam from `aqi-forecast.json` to the
// per-kid recommendation engine, per docs/data-contracts.md §2.
//
// The contract is:
//   scale = futureAqi / max(currentAqi, 1)
//   future.avgAqi = round(base.avgAqi * scale)
//   future.maxAqi = round(base.maxAqi * scale)
//   future.exposureMinutes = base.exposureMinutes * scale  (clamped to [0, totalMinutes])
//   future.totalMinutes is unchanged (route geometry doesn't change with AQI)
//
// Person C produces 24 hourly entries per ZCTA. We map TimeSlice → hour offset
// using NYC-local target hours; if the forecast is short, we clamp to the
// nearest available hour.

import type { TimeSlice } from '@/components/TimeScrubber';
import type { RouteOptions } from '@/lib/recommendation';

export interface ForecastHour {
  hour_offset: number;
  iso_hour: string;
  aqi: number;
  band: string;
}

export interface AqiForecast {
  schema_version: number;
  generated_at: string;
  horizon_hours: number;
  zctas: Record<string, {
    name: string;
    borough: string;
    source: string;
    hourly: ForecastHour[];
  }>;
}

// NYC America/New_York is UTC-4 in April (EDT). Hardcoded for the hackathon —
// `Intl.DateTimeFormat` would be more correct but adds bundle weight.
const NYC_UTC_OFFSET_HOURS = -4;

const SLICE_TARGET_LOCAL_HOUR: Record<TimeSlice, number | 'tomorrow_morning' | 'now'> = {
  now: 'now',
  noon: 12,
  afternoon: 16,
  evening: 18,
  tomorrow: 'tomorrow_morning', // ~8am next day
};

let forecastCache: AqiForecast | null = null;
let inflight: Promise<AqiForecast> | null = null;

export async function loadForecast(): Promise<AqiForecast> {
  if (forecastCache) return forecastCache;
  if (!inflight) {
    inflight = fetch('/data/aqi-forecast.json', { cache: 'force-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`forecast load: ${r.status}`);
        return r.json() as Promise<AqiForecast>;
      })
      .then((f) => { forecastCache = f; return f; });
  }
  return inflight;
}

/** Pick the forecast entry closest to the target time-of-day (NYC local) for
 *  this slice. Falls back to `hour_offset === 0` if the target is out of range
 *  or the slice is `now`. */
export function entryForSlice(
  hourly: ForecastHour[],
  slice: TimeSlice,
  generatedAtIso: string,
): ForecastHour | null {
  if (hourly.length === 0) return null;
  if (slice === 'now') return hourly[0];

  const target = SLICE_TARGET_LOCAL_HOUR[slice];
  const gen = new Date(generatedAtIso);
  if (Number.isNaN(gen.getTime())) return hourly[0];

  // Build the target Date.
  const targetDate = new Date(gen);
  if (target === 'tomorrow_morning') {
    // Bump to the next NYC-local calendar day, then 8am local.
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    targetDate.setUTCHours(8 - NYC_UTC_OFFSET_HOURS, 0, 0, 0);
  } else if (typeof target === 'number') {
    // If the target hour today is already in the past, advance one day so the
    // user sees a forward-looking forecast (matches the scrubber's semantics).
    const targetUtcHours = target - NYC_UTC_OFFSET_HOURS;
    targetDate.setUTCHours(targetUtcHours, 0, 0, 0);
    if (targetDate.getTime() <= gen.getTime()) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }
  } else {
    return hourly[0];
  }

  // Find the hourly entry nearest to targetDate.
  let bestIdx = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < hourly.length; i++) {
    const t = new Date(hourly[i].iso_hour).getTime();
    const d = Math.abs(t - targetDate.getTime());
    if (d < bestDelta) { bestDelta = d; bestIdx = i; }
  }
  return hourly[bestIdx];
}

/** Scale a baseline RouteOptions by the AQI ratio between the forecast hour
 *  for this slice and the "now" hour. Returns a new RouteOptions; baseline is
 *  unchanged. */
export function scaleRoutesByForecast(
  base: RouteOptions,
  forecast: AqiForecast,
  zcta: string,
  slice: TimeSlice,
): RouteOptions {
  const z = forecast.zctas[zcta];
  if (!z || z.hourly.length === 0) return base;
  const nowEntry = z.hourly[0];
  const sliceEntry = entryForSlice(z.hourly, slice, forecast.generated_at);
  if (!nowEntry || !sliceEntry) return base;

  const scale = sliceEntry.aqi / Math.max(nowEntry.aqi, 1);

  const adjust = (r: RouteOptions['standard']) => ({
    avgAqi: Math.round(r.avgAqi * scale),
    maxAqi: Math.round(r.maxAqi * scale),
    exposureMinutes: Math.max(
      0,
      Math.min(
        r.totalMinutes,
        Math.round(r.exposureMinutes * scale * 10) / 10,
      ),
    ),
    totalMinutes: r.totalMinutes,
  });

  return {
    standard: adjust(base.standard),
    atlas: adjust(base.atlas),
  };
}
