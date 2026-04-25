// Gamified savings: turns "AirAware route is cleaner" into a number the user
// can collect across walks. Two metrics:
//
//   1. Avoided unhealthy minutes — minutes saved above the EPA pediatric
//      sensitivity threshold (AQI ≥ 80) by taking AirAware vs Standard.
//   2. Avoided AQI·minutes — concentration-weighted dose. Captures cleaner-air
//      wins even when both routes stay below the threshold.
//
// The "days of life" stat is an honest estimate from WHO PM2.5 dose-response,
// labeled "estimated" in the UI. Same heuristic family as healthMath.ts but
// inverted (gain instead of loss).

import type { RouteOptions, RouteExposure } from './recommendation';

export interface WalkSavings {
  /** Minutes avoided above AQI 80 (pediatric sensitivity). Never negative. */
  avoidedUnhealthyMinutes: number;
  /** Concentration-weighted: (avgStd - avgAtlas) × atlasDuration. Never negative. */
  avoidedAqiMinutes: number;
  /** True if AirAware actually wins on avg AQI by at least 1. */
  atlasWins: boolean;
}

export function walkSavings(options: RouteOptions): WalkSavings {
  const { standard, atlas } = options;
  const atlasWins = atlas.avgAqi < standard.avgAqi - 1;

  const avoidedUnhealthyMinutes = Math.max(
    0,
    Math.round(standard.exposureMinutes - atlas.exposureMinutes),
  );

  const aqiDelta = Math.max(0, standard.avgAqi - atlas.avgAqi);
  const avoidedAqiMinutes = Math.round(aqiDelta * atlas.totalMinutes);

  return { avoidedUnhealthyMinutes, avoidedAqiMinutes, atlasWins };
}

// WHO 2021 PM2.5 dose-response: ~6 μg/m³ chronic exposure costs ~0.5y of life.
// At AQI 100, PM2.5 ≈ 35 μg/m³ above background. One AQI·minute saved is a
// tiny slice of that. Calibrated so 50,000 AQI·minutes avoided ≈ 1 day of
// life expectancy back — i.e. ~3 years of daily Bronx-rush-hour walks.
// Conservative; the WHO methodology runs higher for kids.
const AQI_MINUTES_PER_DAY_OF_LIFE = 50_000;

export function daysOfLifeFromAqiMinutes(aqiMinutes: number): number {
  return aqiMinutes / AQI_MINUTES_PER_DAY_OF_LIFE;
}

// Display helpers. Keep numbers honest — round generously.
export function formatDaysOfLife(days: number): string {
  if (days < 0.01) return '< 0.01 days';
  if (days < 1) return `${days.toFixed(2)} days`;
  if (days < 10) return `${days.toFixed(1)} days`;
  return `${Math.round(days)} days`;
}

export function formatAqiMinutes(aqiMin: number): string {
  if (aqiMin < 1000) return `${aqiMin}`;
  if (aqiMin < 10_000) return `${(aqiMin / 1000).toFixed(1)}k`;
  return `${Math.round(aqiMin / 1000)}k`;
}

// Milestone progression — gives the progress bar something to fill toward.
// Each level ≈ 10× the last so early walks feel rewarding without
// over-promising.
export const MILESTONES: { aqiMinutes: number; label: string }[] = [
  { aqiMinutes: 500,    label: 'First breath' },
  { aqiMinutes: 5_000,  label: 'Clean week' },
  { aqiMinutes: 25_000, label: 'Clean month' },
  { aqiMinutes: 50_000, label: '1 day of life back' },
  { aqiMinutes: 250_000, label: 'Clean year' },
];

export interface MilestoneProgress {
  current: { aqiMinutes: number; label: string } | null;
  next: { aqiMinutes: number; label: string };
  /** 0..1 fraction toward `next` from `current` (or from 0 if no current). */
  fraction: number;
}

export function milestoneProgress(aqiMinutes: number): MilestoneProgress {
  let current: MilestoneProgress['current'] = null;
  let next = MILESTONES[0];
  for (const m of MILESTONES) {
    if (aqiMinutes >= m.aqiMinutes) {
      current = m;
    } else {
      next = m;
      break;
    }
  }
  // Past the final milestone — keep filling toward 2× the last as a soft cap.
  if (current && current === MILESTONES[MILESTONES.length - 1]) {
    next = { aqiMinutes: current.aqiMinutes * 2, label: 'Keep going' };
  }
  const base = current?.aqiMinutes ?? 0;
  const span = Math.max(1, next.aqiMinutes - base);
  const fraction = Math.min(1, Math.max(0, (aqiMinutes - base) / span));
  return { current, next, fraction };
}

// For the "this trip" copy: what would a walk save?
export function previewSavings(std: RouteExposure, atlas: RouteExposure): WalkSavings {
  return walkSavings({ standard: std, atlas });
}
