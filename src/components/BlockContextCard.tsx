'use client';

import { useTranslations } from 'next-intl';
import { getNycAvgOneInN, lookupByZcta, resolveZcta } from '@/lib/erLookup';

interface BlockContextCardProps {
  // The "from" address as the user typed it or picked a preset. The card
  // tries to extract a NYC ZIP from this string. If Person B wires Mapbox
  // geocoding later, prefer passing `zcta` directly to skip the regex.
  address?: string;
  // Optional explicit ZCTA — wins over `address`. Use when geocoding has
  // already extracted a postcode.
  zcta?: string;
}

export function BlockContextCard({ address, zcta }: BlockContextCardProps) {
  const t = useTranslations('blockContext');

  const resolvedZcta = resolveZcta(address, zcta);
  const row = lookupByZcta(resolvedZcta);

  // Three render paths:
  //   1. row found              → "1 in N kids on YOUR block went to the ER"
  //   2. valid ZCTA, no row     → citywide average + soft note that we don't have block-level data
  //   3. fallthrough (impossible if HERO_DEFAULT_ZCTA is in coverage, but typed)
  if (row) {
    return (
      <article
        aria-labelledby="block-context-headline"
        className="overflow-hidden rounded-2xl border border-rose-200 bg-white/80 shadow-lg shadow-rose-500/10 backdrop-blur"
      >
        <div className="flex">
          <div className="w-1.5 bg-gradient-to-b from-rose-400 to-rose-600" />
          <div className="flex-1 px-5 py-4">
            <h2
              id="block-context-headline"
              className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-600"
            >
              {t('headline')} · {row.name} {resolvedZcta}
            </h2>
            <p className="mt-1.5 text-lg font-semibold text-slate-900">
              {t('stat', { oneIn: row.one_in_n })}
            </p>
            <p className="mt-1 text-sm font-medium text-rose-700">
              {t('comparison', { factor: row.ratio_to_nyc_avg, region: 'NYC' })}
            </p>
            <p className="mt-3 text-[10px] text-slate-400">{t('source')}</p>
          </div>
        </div>
      </article>
    );
  }

  const nycOneIn = getNycAvgOneInN();
  return (
    <article
      aria-labelledby="block-context-headline"
      className="overflow-hidden rounded-2xl border border-amber-200 bg-white/80 shadow-lg shadow-amber-500/10 backdrop-blur"
    >
      <div className="flex">
        <div className="w-1.5 bg-gradient-to-b from-amber-400 to-amber-600" />
        <div className="flex-1 px-5 py-4">
          <h2
            id="block-context-headline"
            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-600"
          >
            {t('headline')} · NYC
          </h2>
          <p className="mt-1.5 text-lg font-semibold text-slate-900">
            {t('nycAverage', { oneIn: nycOneIn })}
          </p>
          <p className="mt-1 text-xs text-amber-700">{t('outOfCoverage')}</p>
          <p className="mt-3 text-[10px] text-slate-400">{t('source')}</p>
        </div>
      </div>
    </article>
  );
}
