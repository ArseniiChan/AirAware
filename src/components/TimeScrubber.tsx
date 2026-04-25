'use client';

import { useTranslations } from 'next-intl';

export type TimeSlice = 'now' | 'noon' | 'afternoon' | 'evening' | 'tomorrow';

const SLICES: TimeSlice[] = ['now', 'noon', 'afternoon', 'evening', 'tomorrow'];

interface Props {
  value: TimeSlice;
  onChange: (next: TimeSlice) => void;
}

export function TimeScrubber({ value, onChange }: Props) {
  const t = useTranslations('scrubber');
  const index = SLICES.indexOf(value);

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white/70 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
          {t('label')}
        </span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
          {t(value)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={SLICES.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(SLICES[Number(e.target.value)])}
        className="w-full accent-emerald-600"
        aria-label={t('label')}
      />
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-slate-400">
        {SLICES.map((slice) => (
          <button
            key={slice}
            type="button"
            onClick={() => onChange(slice)}
            className={value === slice ? 'font-bold text-emerald-700' : 'hover:text-slate-600'}
          >
            {t(slice)}
          </button>
        ))}
      </div>
    </div>
  );
}
