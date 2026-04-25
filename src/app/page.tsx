'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { LanguageToggle } from '@/components/LanguageToggle';
import {
  TimeScrubber,
  currentLocalHhmm,
  snapToSlice,
  type DepartTime,
} from '@/components/TimeScrubber';
import { OnboardingStep } from '@/components/OnboardingStep';
import { ComputingScreen } from '@/components/ComputingScreen';
import { LandingPage } from '@/components/LandingPage';
import { AddressAutocomplete, type AddressPick } from '@/components/AddressAutocomplete';
import { RouteSummaryCards } from '@/components/RouteSummaryCards';
import { RouteDirections } from '@/components/RouteDirections';
import { Scorecard } from '@/components/Scorecard';
import { HERO_ROUTES_BY_TIME } from '@/lib/demoData';
import { loadDemoRoutes, type DemoRoutesPayload } from '@/lib/routesData';
import { loadForecast, scaleRoutesByLocalTime, type AqiForecast } from '@/lib/forecastScaling';
import { reverseGeocode, locateMe, GeolocateError } from '@/lib/geolocate';
import type { RouteOptions } from '@/lib/recommendation';

// Lazy-load MapView. mapbox-gl + react-map-gl are ~700KB combined; the
// landing page never needs them. ssr:false because mapbox-gl touches `window`.
// Biggest single perf win — strips the largest dependency from the initial
// bundle and lets the landing page paint in <1s.
const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-emerald-50/40 text-xs text-slate-500">
      Loading map…
    </div>
  ),
});

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

// Resolve a DepartTime ({time: "HH:MM", dayOffset: 0|1}) to NYC-local hour
// 0-23 for the heatmap snapshot loader. dayOffset=1 (tomorrow) folds back
// into the same 24-hour grid library — we don't model multi-day traffic
// drift, just diurnal cycle.
function departTimeToHour(d: DepartTime): number {
  const [hh] = d.time.split(':');
  const h = Number(hh);
  return Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : new Date().getHours();
}

function isHeroPair(from: string, to: string): boolean {
  return from === HERO_FROM && to === HERO_TO;
}

export default function HomePage() {
  const [step, setStep] = useState<Step>('landing');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromPick, setFromPick] = useState<AddressPick | null>(null);
  const [toPick,   setToPick]   = useState<AddressPick | null>(null);
  const [departTime, setDepartTime] = useState<DepartTime>(() => ({
    time: currentLocalHhmm(),
    dayOffset: 0,
  }));
  const [geoRoutes, setGeoRoutes] = useState<DemoRoutesPayload | null>(null);
  const [liveBase, setLiveBase] = useState<RouteOptions | null>(null);
  const [engineWarning, setEngineWarning] = useState<string | null>(null);
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
    if (isHero) return HERO_ROUTES_BY_TIME[snapToSlice(departTime.time, departTime.dayOffset)];
    if (liveBase && forecast) {
      return scaleRoutesByLocalTime(
        liveBase,
        forecast,
        FALLBACK_ZCTA,
        departTime.time,
        departTime.dayOffset,
      );
    }
    return liveBase;
  }, [step, isHero, departTime, liveBase, forecast]);

  // Load the forecast once the user leaves the landing screen. Deferring
  // until "from" keeps the landing-page LCP fast — the forecast file isn't
  // needed until the scrubber renders on the results screen.
  useEffect(() => {
    if (step === 'landing' || forecast) return;
    let cancelled = false;
    loadForecast()
      .then((f) => { if (!cancelled) setForecast(f); })
      .catch((err) => { console.error('forecast load failed', err); });
    return () => { cancelled = true; };
  }, [step, forecast]);

  // On entering results, fetch route geometry. Hero pair → static fixture,
  // anything else → /api/route. Captures live exposure into `liveBase` so
  // the scrubber can scale it per slice.
  // Refetch whenever the input pair changes. Note: we deliberately do NOT
  // null `geoRoutes` between fetches — unmounting <Source> while the
  // mapbox style is mid-update crashes mapbox-gl v3 in `_updateTerrain`.
  // Old routes stay drawn until the new ones replace them.
  useEffect(() => {
    if (step !== 'results') return;
    let cancelled = false;
    setRouteError(null);
    setEngineWarning(null);

    if (isHero) {
      loadDemoRoutes()
        .then((data) => { if (!cancelled) setGeoRoutes(data); })
        .catch((err) => { if (!cancelled) setRouteError(err.message); });
      return () => { cancelled = true; };
    }

    // Returning users land here with empty inputs — don't pound /api/route until
    // both endpoints are filled (typed or long-press-inferred).
    const hasFrom = fromPick !== null || from.trim().length > 0;
    const hasTo = toPick !== null || to.trim().length > 0;
    if (!hasFrom || !hasTo) return () => { cancelled = true; };

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
        setLiveBase({
          standard: engine.standard.exposure,
          atlas: engine.atlas.exposure,
        });
        setEngineWarning(engine.meta?.warning ?? null);
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
              steps: engine.standard.steps,
            },
            atlas: {
              description: 'AQI-aware detour.',
              distance_m: engine.atlas.distance_m,
              duration_s: engine.atlas.duration_s,
              geometry: engine.atlas.geometry,
              waypoint: engine.atlas.waypoint,
              shared_edge_ratio_with_standard: engine.divergence.sharedEdgeRatio,
              steps: engine.atlas.steps,
            },
          },
        };
        setGeoRoutes(adapted);
      })
      .catch((err) => { if (!cancelled) setRouteError(err.message); });
    return () => { cancelled = true; };
  }, [step, isHero, from, to, fromPick, toPick]);

  function reset() {
    setStep('landing');
    setFrom('');
    setTo('');
    setFromPick(null);
    setToPick(null);
    setDepartTime({ time: currentLocalHhmm(), dayOffset: 0 });
    setGeoRoutes(null);
    setLiveBase(null);
    setRouteError(null);
    setEngineWarning(null);
  }

  // Long-press on the map = "I want to go there." Reverse-geocode the pressed
  // point into a destination, and if the user hasn't picked an origin yet,
  // try to use their current location. If geolocation is denied / unavailable
  // we surface a soft prompt asking them to type the origin.
  async function handleMapLongPress(lon: number, lat: number) {
    try {
      const dest = await reverseGeocode(lon, lat);
      setTo(dest.name);
      setToPick(dest);
      setRouteError(null);
    } catch {
      setRouteError('Couldn\'t look up that point. Try again or type a destination.');
      return;
    }

    // Only auto-locate if the user hasn't already chosen an origin.
    if (!fromPick) {
      try {
        const me = await locateMe();
        setFrom(me.name);
        setFromPick(me);
      } catch (err) {
        if (err instanceof GeolocateError && err.code === 'denied') {
          setRouteError('Pin dropped. Type your starting address — location permission was denied.');
        } else if (err instanceof GeolocateError && err.code === 'outside_nyc') {
          setRouteError('Pin dropped. You appear to be outside NYC — type a Bronx address to start.');
        } else {
          setRouteError('Pin dropped. Type your starting address.');
        }
      }
    }
  }

  if (step === 'landing') {
    return (
      <LandingPage
        onStart={() => setStep('from')}
        onReturning={() => setStep('results')}
      />
    );
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
        onPick={(p) => {
          setFrom(p.name);
          setFromPick(p);
        }}
        pickedName={fromPick?.name}
        placeholder="123 Hunts Point Ave, Bronx"
        ctaLabel="Next"
        onSubmit={() => setStep('to')}
        showGeolocate
        presets={[
          { label: 'Hero: Hunts Point Ave', value: HERO_FROM, pick: HERO_FROM_PICK },
        ]}
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
        onPick={(p) => {
          setTo(p.name);
          setToPick(p);
        }}
        pickedName={toPick?.name}
        placeholder="PS 48 — 1290 Spofford Ave, Bronx"
        ctaLabel="Find clean route"
        onSubmit={() => {
          setGeoRoutes(null);
          setLiveBase(null);
          setStep('computing');
        }}
        onBack={() => setStep('from')}
        presets={[
          { label: 'Hero: PS 48', value: HERO_TO, pick: HERO_TO_PICK },
        ]}
      />
    );
  }

  if (step === 'computing') {
    return <ComputingScreen onDone={() => setStep('results')} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50 to-sky-50">
      {/* Soft radial glow behind the map area (echoes the landing page) */}
      <div
        className="pointer-events-none absolute left-1/2 top-32 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-50"
        style={{
          background: 'radial-gradient(closest-side, rgba(74,222,128,0.22), rgba(74,222,128,0) 70%)',
        }}
      />

      <header className="flex items-center justify-between px-6 pt-6">
        <button
          type="button"
          onClick={reset}
          className="text-2xl font-extrabold tracking-tight transition hover:opacity-80"
          aria-label="Start over"
        >
          <span className="bg-gradient-to-br from-emerald-600 to-sky-600 bg-clip-text text-transparent">
            AirAware
          </span>
        </button>
        <LanguageToggle />
      </header>

      <main className="relative z-10 mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-6 pt-4">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-600">
            Your route
          </p>
          {from || to ? (
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="bg-gradient-to-br from-emerald-600 to-sky-600 bg-clip-text text-transparent">
                {from ? from.split(',')[0] : 'Start'}
              </span>
              <span className="px-2 text-slate-400">→</span>
              <span className="bg-gradient-to-br from-emerald-600 to-sky-600 bg-clip-text text-transparent">
                {to ? to.split(',')[0] : 'Destination'}
              </span>
            </h1>
          ) : (
            <h1 className="mt-1 text-lg font-medium tracking-tight text-slate-500 sm:text-xl">
              Press and hold the map to drop a destination, or type below.
            </h1>
          )}
        </div>

        {/* Editable from/to + time scrubber, all at the top so the user can
            iterate without going back through onboarding. */}
        <div
          className="rounded-2xl border border-emerald-100 bg-white/80 p-4 shadow-sm backdrop-blur"
          style={{ animation: 'air-fade 0.6s ease-out both' }}
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Start
              </span>
              <AddressAutocomplete
                value={from}
                onChange={(v) => {
                  setFrom(v);
                  // Typing past the picked address invalidates the locked
                  // coordinate so the engine re-geocodes via /api/route.
                  if (fromPick && v !== fromPick.name) setFromPick(null);
                }}
                onPick={(p) => {
                  setFrom(p.name);
                  setFromPick(p);
                  setRouteError(null);
                }}
                showCurrentLocation
                locked={!!fromPick && fromPick.name === from}
                placeholder="Start address"
                className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <span className="hidden text-center text-2xl text-emerald-500 sm:block">→</span>
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Target
              </span>
              <AddressAutocomplete
                value={to}
                onChange={(v) => {
                  setTo(v);
                  if (toPick && v !== toPick.name) setToPick(null);
                }}
                onPick={(p) => {
                  setTo(p.name);
                  setToPick(p);
                  setRouteError(null);
                }}
                locked={!!toPick && toPick.name === to}
                placeholder="Target address"
                className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
            </label>
          </div>

          <div className="mt-3">
            <TimeScrubber value={departTime} onChange={setDepartTime} />
          </div>
        </div>

        <section
          aria-label="Map"
          className="relative h-[55svh] min-h-[320px] overflow-hidden rounded-2xl border border-emerald-100 bg-white/70 shadow-xl shadow-emerald-500/10 backdrop-blur"
          style={{ animation: 'air-fade 0.6s ease-out 0.1s both' }}
        >
          <MapView
            routes={geoRoutes}
            exposure={routes}
            showHeatmap
            heatmapHour={departTimeToHour(departTime)}
            onLongPress={handleMapLongPress}
          />
        </section>

        <div style={{ animation: 'air-fade 0.6s ease-out 0.05s both' }}>
          <RouteSummaryCards geo={geoRoutes} exposure={routes} warning={engineWarning} />
        </div>

        {geoRoutes?.routes.atlas.steps && geoRoutes.routes.atlas.steps.length > 0 && (
          <div
            style={{ animation: 'air-fade 0.6s ease-out 0.08s both' }}
            className="grid gap-2 sm:grid-cols-2"
          >
            <RouteDirections steps={geoRoutes.routes.atlas.steps} tone="atlas" />
            {geoRoutes.routes.standard.steps && (
              <RouteDirections steps={geoRoutes.routes.standard.steps} tone="standard" />
            )}
          </div>
        )}

        <div style={{ animation: 'air-fade 0.6s ease-out 0.1s both' }}>
          <Scorecard />
        </div>

        {routeError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 backdrop-blur">
            Couldn&rsquo;t plan this route: {routeError}. Try one of the Bronx demo presets.
          </div>
        )}

        <style jsx>{`
          @keyframes air-fade {
            from { transform: translateY(12px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>
      </main>
    </div>
  );
}
