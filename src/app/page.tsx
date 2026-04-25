'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LanguageToggle } from '@/components/LanguageToggle';
import { KidProfilePicker } from '@/components/KidProfilePicker';
import { MultiKidPanel } from '@/components/MultiKidPanel';
import { TimeScrubber, type TimeSlice } from '@/components/TimeScrubber';
import { StayInsideOverlay } from '@/components/StayInsideOverlay';
import { BlockContextCard } from '@/components/BlockContextCard';
import { OnboardingStep } from '@/components/OnboardingStep';
import { ComputingScreen } from '@/components/ComputingScreen';
import { LandingPage } from '@/components/LandingPage';
import { MapView } from '@/components/MapView';
import { HERO_ROUTES_BY_TIME } from '@/lib/demoData';
import { loadDemoRoutes, type DemoRoutesPayload } from '@/lib/routesData';

type Step = 'landing' | 'from' | 'to' | 'computing' | 'results';

const HERO_FROM = 'Hunts Point Ave & Bruckner Blvd, Bronx, NY';
const HERO_TO = 'PS 48 — 1290 Spofford Ave, Bronx, NY';

export default function HomePage() {
  const t = useTranslations();
  const [step, setStep] = useState<Step>('landing');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [timeSlice, setTimeSlice] = useState<TimeSlice>('now');
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [geoRoutes, setGeoRoutes] = useState<DemoRoutesPayload | null>(null);

  const routes = step === 'results' ? HERO_ROUTES_BY_TIME[timeSlice] : null;

  // Load route geometry once we reach results. Cached at the fetch layer so
  // re-entering results from a reset() doesn't re-download.
  useEffect(() => {
    if (step !== 'results' || geoRoutes) return;
    let cancelled = false;
    loadDemoRoutes()
      .then((data) => { if (!cancelled) setGeoRoutes(data); })
      .catch((err) => { console.error('demo-routes load failed', err); });
    return () => { cancelled = true; };
  }, [step, geoRoutes]);

  function reset() {
    setStep('landing');
    setFrom('');
    setTo('');
    setOverlayDismissed(false);
    setTimeSlice('now');
  }

  if (step === 'landing') {
    return <LandingPage onStart={() => setStep('from')} />;
  }

  if (step === 'from') {
    return (
      <OnboardingStep
        step={1}
        totalSteps={2}
        eyebrow="AirAware"
        question="Where are you walking from?"
        helper="Your home, your block, your stoop. We'll start there."
        value={from}
        onChange={setFrom}
        placeholder="123 Hunts Point Ave, Bronx"
        ctaLabel="Next"
        onSubmit={() => setStep('to')}
        presets={[{ label: 'Demo: Hunts Point Ave', value: HERO_FROM }]}
      />
    );
  }

  if (step === 'to') {
    return (
      <OnboardingStep
        step={2}
        totalSteps={2}
        eyebrow="Destination"
        question="Where are you walking to?"
        helper="School, the park, the bodega. Anywhere."
        value={to}
        onChange={setTo}
        placeholder="PS 48 — 1290 Spofford Ave, Bronx"
        ctaLabel="Find clean route"
        onSubmit={() => {
          setOverlayDismissed(false);
          setStep('computing');
        }}
        onBack={() => setStep('from')}
        presets={[{ label: 'Demo: PS 48', value: HERO_TO }]}
      />
    );
  }

  if (step === 'computing') {
    return <ComputingScreen onDone={() => setStep('results')} />;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={reset}
          className="text-left transition hover:opacity-70"
          aria-label="Start over"
        >
          <h1 className="text-xl font-bold tracking-tight">{t('appName')}</h1>
          <p className="text-xs text-gray-500">
            {from.split(',')[0]} → {to.split(',')[0]}
          </p>
        </button>
        <LanguageToggle />
      </header>

      <section
        aria-label="Map"
        className="relative h-[55svh] min-h-[320px] overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
        style={{ animation: 'air-fade 0.6s ease-out both' }}
      >
        <MapView routes={geoRoutes} />
      </section>

      <div style={{ animation: 'air-fade 0.6s ease-out 0.1s both' }}>
        <BlockContextCard />
      </div>

      <div style={{ animation: 'air-fade 0.6s ease-out 0.2s both' }}>
        <KidProfilePicker />
      </div>

      <div style={{ animation: 'air-fade 0.6s ease-out 0.3s both' }}>
        <TimeScrubber value={timeSlice} onChange={setTimeSlice} />
      </div>

      <div style={{ animation: 'air-fade 0.6s ease-out 0.4s both' }}>
        <MultiKidPanel routes={routes} />
      </div>

      {!overlayDismissed && (
        <StayInsideOverlay routes={routes} onDismiss={() => setOverlayDismissed(true)} />
      )}

      <style jsx>{`
        @keyframes air-fade {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </main>
  );
}
