'use client';

import { useTranslations } from 'next-intl';
import { HERO_BLOCK_CONTEXT } from '@/lib/demoData';

// Placeholder for Person A's real card. Uses the seeded hero ZCTA stat.
export function BlockContextCard() {
  const t = useTranslations('blockContext');
  const { ratePer1k, comparisonFactor, region, zcta } = HERO_BLOCK_CONTEXT;
  const oneIn = Math.round(1000 / ratePer1k);

  return (
    <article
      aria-labelledby="block-context-headline"
      className="rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-sm shadow-sm"
    >
      <h2 id="block-context-headline" className="text-xs font-semibold uppercase tracking-wide text-red-700">
        {t('headline')} · ZCTA {zcta}
      </h2>
      <p className="mt-1 text-base font-medium text-gray-900">
        About 1 in {oneIn} kids on your block went to the ER for asthma last year.
      </p>
      <p className="mt-1 text-sm text-red-700">
        {t('comparison', { factor: comparisonFactor, region })}
      </p>
      <p className="mt-2 text-[10px] text-gray-500">{t('source')}</p>
    </article>
  );
}
