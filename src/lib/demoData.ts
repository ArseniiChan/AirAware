import type { RouteOptions } from './recommendation';
import type { TimeSlice } from '@/components/TimeScrubber';

// Hand-tuned route exposures for the hero pair (Hunts Point Ave & Bruckner →
// PS 48 — 1290 Spofford Ave). Values feed `recommend(kid, options)` directly,
// so they're chosen to land specific verdicts at each scrubber position:
//
// Recommendation predicate (see src/lib/recommendation.ts):
//   Maya  (severe, age 7):  passes if route.maxAqi ≤ 50  AND exposureMin ≤ 0
//   Diego (mild,   age 11): passes if route.maxAqi ≤ 100 AND exposureMin ≤ 8
//
// The narrative arc the scrubber walks the audience through:
//   now (8 AM)        → Maya 🔴 STAY_INSIDE,  Diego 🟢 WALK_ATLAS    (rush peaks)
//   noon              → Maya 🔴 STAY_INSIDE,  Diego 🟢 WALK_ATLAS    (slowly clearing)
//   afternoon (4 PM)  → Maya 🟢 WALK_ATLAS,   Diego 🟢 WALK_STANDARD (the flip)
//   evening (6 PM)    → Maya 🔴 STAY_INSIDE,  Diego 🟢 WALK_ATLAS    (rush returns)
//   tomorrow AM       → Maya 🟢 WALK_STANDARD, Diego 🟢 WALK_STANDARD (clean morning)
//
// The hero beat ("Drag the slider — Maya can walk at four") flips off the
// afternoon row's atlas.maxAqi: it sits at 48, just under Maya's strict 50 cap.
// If you tune any number here, eyeball every (kid × slice) combo before pushing.

export const HERO_ROUTES_BY_TIME: Record<TimeSlice, RouteOptions> = {
  // 8 AM — Hunts Point bus depot peaks. Standard route runs the corridor.
  now: {
    standard: { avgAqi: 142, maxAqi: 178, exposureMinutes: 9, totalMinutes: 14 },
    atlas:    { avgAqi:  78, maxAqi:  96, exposureMinutes: 0, totalMinutes: 16 },
  },
  // Noon — between rushes. Air is moderate.
  noon: {
    standard: { avgAqi:  92, maxAqi: 108, exposureMinutes: 1, totalMinutes: 14 },
    atlas:    { avgAqi:  68, maxAqi:  78, exposureMinutes: 0, totalMinutes: 16 },
  },
  // 4 PM — the flip. Atlas drops below Maya's severe-tier cap of AQI 50.
  afternoon: {
    standard: { avgAqi:  56, maxAqi:  64, exposureMinutes: 0, totalMinutes: 14 },
    atlas:    { avgAqi:  42, maxAqi:  48, exposureMinutes: 0, totalMinutes: 16 },
  },
  // 6 PM — second rush peak as buses return to depot.
  evening: {
    standard: { avgAqi: 132, maxAqi: 168, exposureMinutes: 8, totalMinutes: 14 },
    atlas:    { avgAqi:  76, maxAqi:  92, exposureMinutes: 0, totalMinutes: 16 },
  },
  // Tomorrow AM — clean overnight wash; both kids walk either route.
  tomorrow: {
    standard: { avgAqi:  38, maxAqi:  46, exposureMinutes: 0, totalMinutes: 14 },
    atlas:    { avgAqi:  30, maxAqi:  38, exposureMinutes: 0, totalMinutes: 16 },
  },
};

// Block-level ER context now reads live from public/data/er-by-zcta.json
// via src/lib/erLookup.ts — see BlockContextCard.tsx.
