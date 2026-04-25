'use client';

import { useTranslations } from 'next-intl';
import { useKidsStore } from '@/store/kids';
import { recommend, type RouteOptions } from '@/lib/recommendation';

interface Props {
  routes: RouteOptions | null;
  onDismiss: () => void;
}

// Shows when EVERY kid's recommendation is STAY_INSIDE. The presenter taps to
// dismiss and continue the demo.
export function StayInsideOverlay({ routes, onDismiss }: Props) {
  const t = useTranslations('stayInside');
  const { kids } = useKidsStore();

  if (!routes || kids.length === 0) return null;

  const allStayInside = kids.every((kid) => recommend(kid, routes).code === 'STAY_INSIDE');
  if (!allStayInside) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="stay-inside-headline"
      className="fixed inset-0 z-50 flex items-center justify-center bg-red-600/90 p-6 text-white"
      onClick={onDismiss}
    >
      <div className="max-w-sm space-y-3 text-center">
        <p className="text-5xl" aria-hidden>
          🔴
        </p>
        <h2 id="stay-inside-headline" className="text-2xl font-bold">
          {t('headline')}
        </h2>
        <p className="text-sm opacity-90">{t('advice')}</p>
        <p className="text-xs opacity-70">Tap to dismiss</p>
      </div>
    </div>
  );
}
