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
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{t('label')}</span>
        <span className="font-semibold text-gray-900">{t(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={SLICES.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(SLICES[Number(e.target.value)])}
        className="w-full accent-gray-900"
        aria-label={t('label')}
      />
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-gray-400">
        {SLICES.map((slice) => (
          <button
            key={slice}
            type="button"
            onClick={() => onChange(slice)}
            className={value === slice ? 'font-bold text-gray-900' : ''}
          >
            {t(slice)}
          </button>
        ))}
      </div>
    </div>
  );
}
