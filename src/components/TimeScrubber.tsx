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
    <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white/70 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
          {t('label')}
        </span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
          {t(value)}
        </span>
      </div>

      <input
        type="time"
        value={time}
        onChange={(e) => handleTimeChange(e.target.value)}
        aria-label={t('label')}
        className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-center text-base font-semibold tabular-nums text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
      />

      <div className="flex flex-wrap justify-between gap-1 text-[10px] uppercase tracking-wide">
        {SLICES.map((slice) => (
          <button
            key={slice}
            type="button"
            onClick={() => onChange(slice)}
            className={`rounded-full px-2 py-0.5 transition ${
              value === slice
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            {t(slice)}
          </button>
        ))}
      </div>
    </div>
  );
}
