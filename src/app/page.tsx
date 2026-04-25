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
import type { AddressPick } from '@/components/AddressAutocomplete';
import { HERO_ROUTES_BY_TIME } from '@/lib/demoData';
import { loadDemoRoutes, type DemoRoutesPayload } from '@/lib/routesData';

type Step = 'landing' | 'from' | 'to' | 'computing' | 'results';

const HERO_FROM = 'Hunts Point Ave & Bruckner Blvd, Bronx, NY';
const HERO_TO = 'PS 48 — 1290 Spofford Ave, Bronx, NY';

// Hero coordinates (resolved via Mapbox geocoding during demo prep). We bake
// them into the preset chip so a tap fires `onPick` instantly without
// round-tripping the geocoder on stage.
const HERO_FROM_PICK: AddressPick = { name: HERO_FROM, lon: -73.89083, lat: 40.82031 };
const HERO_TO_PICK:   AddressPick = { name: HERO_TO,   lon: -73.88689, lat: 40.81423 };

function isHeroPair(from: string, to: string): boolean {
  return from === HERO_FROM && to === HERO_TO;
}

export default function HomePage() {
  const t = useTranslations();
  const [step, setStep] = useState<Step>('landing');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromPick, setFromPick] = useState<AddressPick | null>(null);
  const [toPick,   setToPick]   = useState<AddressPick | null>(null);
  const [timeSlice, setTimeSlice] = useState<TimeSlice>('now');
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [geoRoutes, setGeoRoutes] = useState<DemoRoutesPayload | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const routes = step === 'results' ? HERO_ROUTES_BY_TIME[timeSlice] : null;

  // When entering results, decide route source: hero pair → static
  // demo-routes.json (guaranteed to diverge); anything else → POST /api/route.
  useEffect(() => {
    if (step !== 'results' || geoRoutes) return;
    let cancelled = false;
    setRouteError(null);

    if (isHeroPair(from, to)) {
      loadDemoRoutes()
        .then((data) => { if (!cancelled) setGeoRoutes(data); })
        .catch((err) => { if (!cancelled) setRouteError(err.message); });
      return () => { cancelled = true; };
    }

    // Non-hero pair: live engine. Send coords if we have them; the API will
    // geocode strings as a fallback.
    const body = {
      from: fromPick ? [fromPick.lon, fromPick.lat] : from,
      to:   toPick   ? [toPick.lon,   toPick.lat]   : to,
    };
    fetch('/api/route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).message ?? `HTTP ${res.status}`);
        return res.json();
      })
      .then((engine) => {
        if (cancelled) return;
        // Adapt EngineResult → DemoRoutesPayload shape so MapView is unchanged.
        const adapted: DemoRoutesPayload = {
          schema_version: 1,
          generated_at: new Date().toISOString(),
          pair: {
            id: 'live',
            from: { name: fromPick?.name ?? from, lon: engine.from.lon, lat: engine.from.lat, zcta: '' },
            to:   { name: toPick?.name   ?? to,   lon: engine.to.lon,   lat: engine.to.lat,   zcta: '' },
          },
          routes: {
            standard: {
              description: 'Standard walking route.',
              distance_m: engine.standard.distance_m,
              duration_s: engine.standard.duration_s,
              geometry: engine.standard.geometry,
            },
            atlas: {
              description: 'AQI-aware detour.',
              distance_m: engine.atlas.distance_m,
              duration_s: engine.atlas.duration_s,
              geometry: engine.atlas.geometry,
              waypoint: engine.atlas.waypoint,
              shared_edge_ratio_with_standard: engine.divergence.sharedEdgeRatio,
            },
          },
        };
        setGeoRoutes(adapted);
      })
      .catch((err) => { if (!cancelled) setRouteError(err.message); });
    return () => { cancelled = true; };
  }, [step, geoRoutes, from, to, fromPick, toPick]);

  function reset() {
    setStep('landing');
    setFrom('');
    setTo('');
    setFromPick(null);
    setToPick(null);
    setOverlayDismissed(false);
    setTimeSlice('now');
    setGeoRoutes(null);
    setRouteError(null);
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
        onPick={(p) => { setFrom(p.name); setFromPick(p); }}
        pickedName={fromPick?.name}
        placeholder="123 Hunts Point Ave, Bronx"
        ctaLabel="Next"
        onSubmit={() => setStep('to')}
        presets={[{ label: 'Demo: Hunts Point Ave', value: HERO_FROM, pick: HERO_FROM_PICK }]}
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
        onPick={(p) => { setTo(p.name); setToPick(p); }}
        pickedName={toPick?.name}
        placeholder="PS 48 — 1290 Spofford Ave, Bronx"
        ctaLabel="Find clean route"
        onSubmit={() => {
          setOverlayDismissed(false);
          setGeoRoutes(null); // recompute for this new pair
          setStep('computing');
        }}
        onBack={() => setStep('from')}
        presets={[{ label: 'Demo: PS 48', value: HERO_TO, pick: HERO_TO_PICK }]}
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

      {routeError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Couldn&rsquo;t plan this route: {routeError}. Try one of the Bronx demo presets.
        </div>
      )}

      <div style={{ animation: 'air-fade 0.6s ease-out 0.1s both' }}>
        <BlockContextCard address={from} />
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
