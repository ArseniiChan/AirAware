'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useKidsStore } from '@/store/kids';
import {
  recommend,
  verdictColor,
  verdictEmoji,
  type RouteOptions,
} from '@/lib/recommendation';

interface Props {
  routes: RouteOptions | null;
}

export function MultiKidPanel({ routes }: Props) {
  const t = useTranslations('panel');
  const { kids } = useKidsStore();
  const [showDetails, setShowDetails] = useState(false);

  if (!routes) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
        Pick a home and a destination to see a route.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {kids.map((kid) => {
          const rec = recommend(kid, routes);
          return (
            <article
              key={kid.id}
              className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
            >
              <span
                className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-white ${verdictColor(rec.verdict)}`}
                aria-hidden
              >
                {verdictEmoji(rec.verdict)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span aria-hidden>{kid.emoji}</span>
                  <span>{rec.headline}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-600">{rec.detail}</p>
              </div>
            </article>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="text-xs font-medium text-gray-500 hover:text-gray-900"
      >
        {showDetails ? '▾' : '▸'} {t('details')}
      </button>

      {showDetails && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
          <dt>{t('standardRoute')} — {t('exposureMinutes')}</dt>
          <dd className="text-right font-medium">{routes.standard.exposureMinutes} min</dd>
          <dt>{t('atlasRoute')} — {t('exposureMinutes')}</dt>
          <dd className="text-right font-medium">{routes.atlas.exposureMinutes} min</dd>
          <dt>{t('standardRoute')} — max AQI</dt>
          <dd className="text-right font-medium">{routes.standard.maxAqi}</dd>
          <dt>{t('atlasRoute')} — max AQI</dt>
          <dd className="text-right font-medium">{routes.atlas.maxAqi}</dd>
        </dl>
      )}
    </div>
  );
}
