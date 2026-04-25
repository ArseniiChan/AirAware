// Last-N AddressPick history persisted in localStorage. Used by OnboardingStep
// to surface "Recent" chips so judges (and real users) don't retype.

import type { AddressPick } from '@/components/AddressAutocomplete';

const KEY = 'airaware-recent-picks-v1';
const MAX = 4;

export function loadRecentPicks(): AddressPick[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is AddressPick =>
          p && typeof p.name === 'string' && typeof p.lon === 'number' && typeof p.lat === 'number',
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function rememberPick(pick: AddressPick): void {
  if (typeof window === 'undefined') return;
  const existing = loadRecentPicks().filter((p) => p.name !== pick.name);
  const next = [pick, ...existing].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded / private mode → silently no-op.
  }
}
