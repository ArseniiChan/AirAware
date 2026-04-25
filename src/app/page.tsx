'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { loadForecast, scaleRoutesByForecast, type AqiForecast } from '@/lib/forecastScaling';
import type { RouteOptions } from '@/lib/recommendation';

type Step = 'landing' | 'from' | 'to' | 'computing' | 'results';

const HERO_FROM = 'Hunts Point Ave & Bruckner Blvd, Bronx, NY';
const HERO_TO = 'PS 48 — 1290 Spofford Ave, Bronx, NY';

// Hero coordinates baked in so the demo preset doesn't round-trip the geocoder.
// Both endpoints sit in NYC ZCTA 10474 (Hunts Point, Bronx) — used by Person A's
// BlockContextCard for the ER-rate lookup.
const HERO_FROM_PICK: AddressPick = { name: HERO_FROM, lon: -73.89083, lat: 40.82031, zcta: '10474' };
const HERO_TO_PICK:   AddressPick = { name: HERO_TO,   lon: -73.88689, lat: 40.81423, zcta: '10474' };

// Non-hero pairs scale exposure by Person C's forecast for this ZCTA. Hunts
// Point covers the demo; for arbitrary judge-typed addresses we use it as a
// reasonable Bronx-default until we wire `zcta.geojson` point-in-polygon.
const FALLBACK_ZCTA = '10474';

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
  const [liveBase, setLiveBase] = useState<RouteOptions | null>(null);
  const [forecast, setForecast] = useState<AqiForecast | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const isHero = isHeroPair(from, to);

  // The kid recommendation panel consumes a RouteOptions per slice. Three
  // sources, in priority order:
  //   1. Hero pair → Person D's hand-tuned HERO_ROUTES_BY_TIME (guaranteed
  //      to flip Maya at 4pm — the demo's load-bearing moment).
  //   2. Non-hero with live engine + forecast → live exposure scaled by
  //      futureAqi/currentAqi per docs/data-contracts.md §2.
  //   3. Non-hero without forecast → live exposure unscaled (slice has no
  //      effect; better than nothing while loading).
  const routes: RouteOptions | null = useMemo(() => {
    if (step !== 'results') return null;
    if (isHero) return HERO_ROUTES_BY_TIME[timeSlice];
    if (liveBase && forecast) {
      return scaleRoutesByForecast(liveBase, forecast, FALLBACK_ZCTA, timeSlice);
    }
    return liveBase;
  }, [step, isHero, timeSlice, liveBase, forecast]);

  // Load the forecast once on mount so the scrubber is responsive immediately
  // when the user reaches results.
  useEffect(() => {
    let cancelled = false;
    loadForecast()
      .then((f) => { if (!cancelled) setForecast(f); })
      .catch((err) => { console.error('forecast load failed', err); });
    return () => { cancelled = true; };
  }, []);

  // On entering results, fetch route geometry. Hero pair → static fixture,
  // anything else → /api/route. Captures live exposure into `liveBase` so
  // the scrubber can scale it per slice.
  useEffect(() => {
    if (step !== 'results' || geoRoutes) return;
    let cancelled = false;
    setRouteError(null);

    if (isHero) {
      loadDemoRoutes()
        .then((data) => { if (!cancelled) setGeoRoutes(data); })
        .catch((err) => { if (!cancelled) setRouteError(err.message); });
      return () => { cancelled = true; };
    }

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
        // Persist live exposure for the kid recommendations panel.
        setLiveBase({
          standard: engine.standard.exposure,
          atlas: engine.atlas.exposure,
        });
        // Adapt EngineResult → DemoRoutesPayload for MapView.
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
  }, [step, geoRoutes, isHero, from, to, fromPick, toPick]);

  function reset() {
    setStep('landing');
    setFrom('');
    setTo('');
    setFromPick(null);
    setToPick(null);
    setOverlayDismissed(false);
    setTimeSlice('now');
    setGeoRoutes(null);
    setLiveBase(null);
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
          setGeoRoutes(null);
          setLiveBase(null);
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
        <MapView routes={geoRoutes} showHeatmap />
      </section>

      {routeError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Couldn&rsquo;t plan this route: {routeError}. Try one of the Bronx demo presets.
        </div>
      )}

      <div style={{ animation: 'air-fade 0.6s ease-out 0.1s both' }}>
        <BlockContextCard address={from} zcta={fromPick?.zcta} />
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
