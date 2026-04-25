'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KidProfile, Severity } from '@/lib/recommendation';

interface KidsState {
  kids: KidProfile[];
  activeKidId: string | null;
  addKid: (input: Omit<KidProfile, 'id'>) => void;
  updateKid: (id: string, patch: Partial<Omit<KidProfile, 'id'>>) => void;
  removeKid: (id: string) => void;
  setActiveKid: (id: string) => void;
}

const SEED_KIDS: KidProfile[] = [
  { id: 'maya', name: 'Maya', emoji: '🌸', age: 7, severity: 'severe' },
  { id: 'diego', name: 'Diego', emoji: '🦖', age: 11, severity: 'mild' },
];

function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export const useKidsStore = create<KidsState>()(
  persist(
    (set) => ({
      kids: SEED_KIDS,
      activeKidId: SEED_KIDS[0]?.id ?? null,
      addKid: (input) =>
        set((s) => {
          if (s.kids.length >= 3) return s;
          const kid: KidProfile = { id: newId(), ...input };
          return { kids: [...s.kids, kid], activeKidId: s.activeKidId ?? kid.id };
        }),
      updateKid: (id, patch) =>
        set((s) => ({
          kids: s.kids.map((k) => (k.id === id ? { ...k, ...patch } : k)),
        })),
      removeKid: (id) =>
        set((s) => {
          const kids = s.kids.filter((k) => k.id !== id);
          const activeKidId = s.activeKidId === id ? (kids[0]?.id ?? null) : s.activeKidId;
          return { kids, activeKidId };
        }),
      setActiveKid: (id) => set({ activeKidId: id }),
    }),
    {
      name: 'airaware-kids-v1',
    },
  ),
);

export const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];
