'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useKidsStore } from '@/store/kids';
import { recommend, type RouteOptions } from '@/lib/recommendation';
import { HomeIcon } from '@/components/icons/Icons';

interface Props {
  routes: RouteOptions | null;
  onDismiss: () => void;
  /** Tap-to-dismiss is always available; this enables a 4.5s auto-dismiss
   *  so the overlay doesn't block the rest of the demo when nobody touches it. */
  autoDismissMs?: number;
}

// Shows when EVERY kid's recommendation is STAY_INSIDE. Auto-dismisses so
// the demo flow continues even if the presenter doesn't tap; manual tap
// dismisses immediately.
export function StayInsideOverlay({ routes, onDismiss, autoDismissMs = 4500 }: Props) {
  const t = useTranslations('stayInside');
  const { kids } = useKidsStore();
  const visible =
    routes && kids.length > 0 && kids.every((kid) => recommend(kid, routes).code === 'STAY_INSIDE');

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [visible, autoDismissMs, onDismiss]);

  if (!visible) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="stay-inside-headline"
      className="fixed inset-0 z-50 flex items-center justify-center bg-red-600/90 p-6 text-white"
      onClick={onDismiss}
      style={{ animation: 'air-fade 0.4s ease-out both' }}
    >
      <div className="max-w-sm space-y-3 text-center">
        <div className="flex justify-center" aria-hidden>
          <HomeIcon size={56} />
        </div>
        <h2 id="stay-inside-headline" className="text-2xl font-bold">
          {t('headline')}
        </h2>
        <p className="text-sm opacity-90">{t('advice')}</p>
        <p className="text-xs opacity-70">Tap anywhere · auto-dismiss in 4s</p>
      </div>
    </div>
  );
}
