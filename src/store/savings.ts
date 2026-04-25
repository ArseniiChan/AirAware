'use client';

// Lifetime savings tally. localStorage-only, per the no-auth privacy stance.
// Incremented explicitly via "I'm taking this route" — never on render — so
// the counter reflects intent, not accidental refreshes.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SavingsState {
  totalAqiMinutesAvoided: number;
  totalUnhealthyMinutesAvoided: number;
  walksLogged: number;
  firstUseDate: string | null;
  recordWalk: (input: { aqiMinutes: number; unhealthyMinutes: number }) => void;
  reset: () => void;
}

export const useSavingsStore = create<SavingsState>()(
  persist(
    (set) => ({
      totalAqiMinutesAvoided: 0,
      totalUnhealthyMinutesAvoided: 0,
      walksLogged: 0,
      firstUseDate: null,
      recordWalk: ({ aqiMinutes, unhealthyMinutes }) =>
        set((s) => ({
          totalAqiMinutesAvoided: s.totalAqiMinutesAvoided + Math.max(0, aqiMinutes),
          totalUnhealthyMinutesAvoided:
            s.totalUnhealthyMinutesAvoided + Math.max(0, unhealthyMinutes),
          walksLogged: s.walksLogged + 1,
          firstUseDate: s.firstUseDate ?? new Date().toISOString(),
        })),
      reset: () =>
        set({
          totalAqiMinutesAvoided: 0,
          totalUnhealthyMinutesAvoided: 0,
          walksLogged: 0,
          firstUseDate: null,
        }),
    }),
    { name: 'airaware-savings-v1' },
  ),
);
