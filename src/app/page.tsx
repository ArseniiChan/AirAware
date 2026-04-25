'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LanguageToggle } from '@/components/LanguageToggle';
import { KidProfilePicker } from '@/components/KidProfilePicker';
import { MultiKidPanel } from '@/components/MultiKidPanel';
import { TimeScrubber, type TimeSlice } from '@/components/TimeScrubber';
import { StayInsideOverlay } from '@/components/StayInsideOverlay';
import { BlockContextCard } from '@/components/BlockContextCard';
import { HERO_ROUTES_BY_TIME } from '@/lib/demoData';

export default function HomePage() {
  const t = useTranslations();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [routeRequested, setRouteRequested] = useState(false);
  const [timeSlice, setTimeSlice] = useState<TimeSlice>('now');
  const [overlayDismissed, setOverlayDismissed] = useState(false);

  const routes = routeRequested ? HERO_ROUTES_BY_TIME[timeSlice] : null;

  function loadHeroPair() {
    setFrom('Hunts Point Ave & Bruckner Blvd, Bronx, NY');
    setTo('PS 48 — 1290 Spofford Ave, Bronx, NY');
    setRouteRequested(true);
    setOverlayDismissed(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!from.trim() || !to.trim()) return;
    setRouteRequested(true);
    setOverlayDismissed(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('appName')}</h1>
          <p className="text-xs text-gray-500">{t('tagline')}</p>
        </div>
        <LanguageToggle />
      </header>

      <section aria-label="Map placeholder" className="relative h-56 overflow-hidden rounded-lg border border-gray-200 bg-gradient-to-br from-emerald-100 via-yellow-100 to-red-200">
        <p className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
          Map placeholder — Person B wires Mapbox here
        </p>
      </section>

      <form onSubmit={handleSubmit} className="grid gap-2 sm:grid-cols-2">
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder={t('addressFrom')}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
        />
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={t('addressTo')}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
        />
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
          >
            {t('findRoute')}
          </button>
          <button
            type="button"
            onClick={loadHeroPair}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Demo · Hunts Point → PS 48
          </button>
        </div>
      </form>

      {routeRequested && <BlockContextCard />}

      <KidProfilePicker />

      {routeRequested && <TimeScrubber value={timeSlice} onChange={setTimeSlice} />}

      <MultiKidPanel routes={routes} />

      {!overlayDismissed && (
        <StayInsideOverlay routes={routes} onDismiss={() => setOverlayDismissed(true)} />
      )}
    </main>
  );
}
