import type { RouteOptions } from './recommendation';
import type { TimeSlice } from '@/components/TimeScrubber';

// Pre-baked route exposure data for the hero scenario across time slices.
// Real data from B + C will replace this; shape stays the same.
// Hero: Hunts Point Ave → PS 48. Bus depot peaks 7-9 AM and 3-6 PM.
export const HERO_ROUTES_BY_TIME: Record<TimeSlice, RouteOptions> = {
  now: {
    standard: { avgAqi: 142, maxAqi: 178, exposureMinutes: 9, totalMinutes: 14 },
    atlas:    { avgAqi:  92, maxAqi: 118, exposureMinutes: 4, totalMinutes: 16 },
  },
  noon: {
    standard: { avgAqi:  98, maxAqi: 121, exposureMinutes: 5, totalMinutes: 14 },
    atlas:    { avgAqi:  72, maxAqi:  88, exposureMinutes: 1, totalMinutes: 16 },
  },
  afternoon: {
    standard: { avgAqi:  78, maxAqi:  94, exposureMinutes: 0, totalMinutes: 14 },
    atlas:    { avgAqi:  61, maxAqi:  72, exposureMinutes: 0, totalMinutes: 16 },
  },
  evening: {
    standard: { avgAqi: 134, maxAqi: 168, exposureMinutes: 8, totalMinutes: 14 },
    atlas:    { avgAqi:  88, maxAqi: 112, exposureMinutes: 3, totalMinutes: 16 },
  },
  tomorrow: {
    standard: { avgAqi:  62, maxAqi:  78, exposureMinutes: 0, totalMinutes: 14 },
    atlas:    { avgAqi:  48, maxAqi:  58, exposureMinutes: 0, totalMinutes: 16 },
  },
};

// Block-level ER context now reads live from public/data/er-by-zcta.json
// via src/lib/erLookup.ts — see BlockContextCard.tsx.
