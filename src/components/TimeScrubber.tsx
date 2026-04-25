'use client';

import { useTranslations } from 'next-intl';
import type { WeatherCaption } from '@/lib/weatherData';

// Coarse demo buckets — used only for hero-pair lookup in HERO_ROUTES_BY_TIME.
// User-facing time is hourly via the input below.
export type TimeSlice = 'now' | 'noon' | 'afternoon' | 'evening' | 'tomorrow';

export interface DepartTime {
  /** "HH:MM" 24-hour, NYC local. Source of truth from the time input. */
  time: string;
  /** 0 = today, 1 = tomorrow. */
  dayOffset: 0 | 1;
}

export function currentLocalHhmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Snap a typed time to a TimeSlice bucket — only used for hero data lookup.
// "Now" wins if within 60 min of current hour; otherwise pick the closest of
// noon / 4pm / 6pm; tomorrow if dayOffset=1.
export function snapToSlice(time: string, dayOffset: 0 | 1): TimeSlice {
  if (dayOffset === 1) return 'tomorrow';
  const [h, m] = time.split(':').map(Number);
  const hours = h + (m || 0) / 60;
  const nowHour = new Date().getHours();
  if (Math.abs(hours - nowHour) < 1) return 'now';
  const buckets: { slice: TimeSlice; hour: number }[] = [
    { slice: 'noon',      hour: 12 },
    { slice: 'afternoon', hour: 16 },
    { slice: 'evening',   hour: 18 },
  ];
  let best = buckets[0];
  let bestDist = Math.abs(hours - best.hour);
  for (const b of buckets.slice(1)) {
    const d = Math.abs(hours - b.hour);
    if (d < bestDist) { best = b; bestDist = d; }
  }
  return best.slice;
}

// Render "16:30" as "4:30 PM" so the user can sanity-check the 24h input.
function formatAmPm(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const m = Number(mStr ?? '0');
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

interface Props {
  value: DepartTime;
  onChange: (next: DepartTime) => void;
  /** Optional weather narrative shown below the input. */
  weather?: WeatherCaption | null;
}

export function TimeScrubber({ value, onChange, weather }: Props) {
  const t = useTranslations('scrubber');

  return (
    <div className="space-y-2 rounded-xl border border-emerald-100 bg-white/70 px-3 py-2 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
          {t('label')}
        </span>
        <input
          type="time"
          value={value.time}
          onChange={(e) => onChange({ ...value, time: e.target.value })}
          aria-label={t('label')}
          className="w-24 rounded-md border border-emerald-200 bg-white px-2 py-1 text-center text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
        />
        <span className="text-[12px] font-medium text-slate-700">{formatAmPm(value.time)}</span>
        <div className="ml-auto flex gap-1">
          <DayChip
            active={value.dayOffset === 0}
            onClick={() => onChange({ ...value, dayOffset: 0 })}
            label="Today"
          />
          <DayChip
            active={value.dayOffset === 1}
            onClick={() => onChange({ ...value, dayOffset: 1 })}
            label="Tomorrow"
          />
        </div>
      </div>
      {weather && (
        <div className="border-t border-emerald-100/80 pt-1.5 text-center">
          <div className="text-[11px] font-semibold text-slate-700">{weather.primary}</div>
          {weather.causal && (
            <div className="text-[11px] italic text-slate-500">{weather.causal}</div>
          )}
        </div>
      )}
    </div>
  );
}

function DayChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white'
          : 'rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100'
      }
    >
      {label}
    </button>
  );
}
