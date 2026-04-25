'use client';

import { useTranslations } from 'next-intl';
import {
  HERO_DEFAULT_ZCTA,
  extractZctaFromAddress,
  getNycAvgOneInN,
  lookupByZcta,
} from '@/lib/erLookup';

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

  const resolvedZcta = zcta ?? extractZctaFromAddress(address) ?? HERO_DEFAULT_ZCTA;
  const row = lookupByZcta(resolvedZcta);

  // Three render paths:
  //   1. row found              → "1 in N kids on YOUR block went to the ER"
  //   2. valid ZCTA, no row     → citywide average + soft note that we don't have block-level data
  //   3. fallthrough (impossible if HERO_DEFAULT_ZCTA is in coverage, but typed)
  if (row) {
    return (
      <article
        aria-labelledby="block-context-headline"
        className="rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-sm shadow-sm"
      >
        <h2
          id="block-context-headline"
          className="text-xs font-semibold uppercase tracking-wide text-red-700"
        >
          {t('headline')} · {row.name} {resolvedZcta}
        </h2>
        <p className="mt-1 text-base font-medium text-gray-900">
          {t('stat', { oneIn: row.one_in_n })}
        </p>
        <p className="mt-1 text-sm text-red-700">
          {t('comparison', { factor: row.ratio_to_nyc_avg, region: 'NYC' })}
        </p>
        <p className="mt-2 text-[10px] text-gray-500">{t('source')}</p>
      </article>
    );
  }

  // Out-of-coverage ZCTA: show the citywide stat + soft notice. Honest, never empty.
  const nycOneIn = getNycAvgOneInN();
  return (
    <article
      aria-labelledby="block-context-headline"
      className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-sm shadow-sm"
    >
      <h2
        id="block-context-headline"
        className="text-xs font-semibold uppercase tracking-wide text-amber-700"
      >
        {t('headline')} · NYC
      </h2>
      <p className="mt-1 text-base font-medium text-gray-900">
        {t('nycAverage', { oneIn: nycOneIn })}
      </p>
      <p className="mt-1 text-xs text-amber-700">{t('outOfCoverage')}</p>
      <p className="mt-2 text-[10px] text-gray-500">{t('source')}</p>
    </article>
  );
}
