'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export type TimeSlice = 'now' | 'noon' | 'afternoon' | 'evening' | 'tomorrow';

const SLICES: TimeSlice[] = ['now', 'noon', 'afternoon', 'evening', 'tomorrow'];

// Canonical hour-of-day for each slice; used to snap a typed time → slice.
const SLICE_HOUR: Record<TimeSlice, number> = {
  now: -1,        // resolved at runtime to current hour
  noon: 12,
  afternoon: 16,
  evening: 18,
  tomorrow: 8,    // tomorrow morning
};

function defaultTimeFor(slice: TimeSlice): string {
  const h = slice === 'now' ? new Date().getHours() : SLICE_HOUR[slice];
  return `${String(h).padStart(2, '0')}:00`;
}

// Snap a HH:MM string to the closest TimeSlice. "Tomorrow" wins for early-AM
// times that come before the current hour (e.g. it's 3pm and the user types 7am).
function snapToSlice(hhmm: string): TimeSlice {
  const [hStr, mStr] = hhmm.split(':');
  const hours = Number(hStr) + Number(mStr) / 60;
  const nowHour = new Date().getHours();

  if (hours < nowHour - 0.5) return 'tomorrow';

  const candidates: { slice: TimeSlice; hour: number }[] = [
    { slice: 'now',       hour: nowHour },
    { slice: 'noon',      hour: 12 },
    { slice: 'afternoon', hour: 16 },
    { slice: 'evening',   hour: 18 },
    { slice: 'tomorrow',  hour: 24 + 8 },
  ];
  let best = candidates[0];
  let bestDist = Math.abs(hours - best.hour);
  for (const c of candidates.slice(1)) {
    const d = Math.abs(hours - c.hour);
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return best.slice;
}

interface Props {
  value: TimeSlice;
  onChange: (next: TimeSlice) => void;
}

export function TimeScrubber({ value, onChange }: Props) {
  const t = useTranslations('scrubber');
  const [time, setTime] = useState<string>(() => defaultTimeFor(value));

  // Keep the input in sync if `value` is changed elsewhere (e.g. preset chips
  // below).
  useEffect(() => {
    setTime(defaultTimeFor(value));
  }, [value]);

  function handleTimeChange(next: string) {
    setTime(next);
    onChange(snapToSlice(next));
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white/70 px-3 py-2 shadow-sm backdrop-blur">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
        {t('label')}
      </span>
      <input
        type="time"
        value={time}
        onChange={(e) => handleTimeChange(e.target.value)}
        aria-label={t('label')}
        className="w-24 rounded-md border border-emerald-200 bg-white px-2 py-1 text-center text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
      />
      <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
        {t(value)}
      </span>
    </div>
  );
}
