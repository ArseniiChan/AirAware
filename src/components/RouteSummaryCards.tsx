'use client';

// Always-visible per-route metrics: walk time, distance, steps, time through
// unhealthy air, and a small lifetime-impact estimate. Sits between the map
// and the kid recommendation panel.

import { useEffect, useMemo, useRef, useState, type ComponentType, type SVGProps } from 'react';
import { useLocale } from 'next-intl';
import { useKidsStore } from '@/store/kids';
import { useSavingsStore } from '@/store/savings';
import {
  estimateSteps,
  formatDistance,
  formatWalkTime,
  lifeImpactForWalk,
} from '@/lib/healthMath';
import { walkSavings } from '@/lib/savings';
import { isSpeechAvailable, speak, cancelSpeech } from '@/lib/voiceMode';
import { ClockIcon, RulerIcon, StepsIcon } from '@/components/icons/Icons';
import type { RouteOptions } from '@/lib/recommendation';
import type { DemoRoutesPayload } from '@/lib/routesData';

interface Props {
  /** Geometry + distance/duration. Source of truth for steps + walk time. */
  geo: DemoRoutesPayload | null;
  /** Per-time-slice exposure stats. Drives "minutes through unhealthy air"
   *  and the life-impact estimate. */
  exposure: RouteOptions | null;
  /** Engine diagnostic from /api/route. Surfaces "no cleaner route found" so
   *  identical numbers don't look like a silent UI bug. */
  warning?: string | null;
}

// Map raw engine warnings to user-facing copy. Anything we don't recognize
// gets a generic message — never the raw string.
function warningCopy(w: string | null | undefined): string | null {
  if (!w) return null;
  if (w.startsWith('no atlas candidate')) {
    return "This walk is too short to find a meaningfully cleaner route — the standard route is the best option today.";
  }
  if (w.startsWith('atlas not measurably cleaner')) {
    return "Air quality is similar across nearby routes today — the standard route is fine.";
  }
  if (w.startsWith('atlas shares')) {
    return "We couldn't find a meaningfully different cleaner route for this walk.";
  }
  return "Couldn't find a cleaner alternative for this walk today.";
}

export function RouteSummaryCards({ geo, exposure, warning = null }: Props) {
  const activeKidId = useKidsStore((s) => s.activeKidId);
  const kids = useKidsStore((s) => s.kids);
  const activeKid = useMemo(
    () => kids.find((k) => k.id === activeKidId) ?? kids[0] ?? null,
    [kids, activeKidId],
  );
  const [showImpact, setShowImpact] = useState(false);
  const recordWalk = useSavingsStore((s) => s.recordWalk);
  const [logged, setLogged] = useState(false);
  const locale = useLocale();
  // Voice summary state: opt-in via the speaker button, persists across
  // pair swaps so a blind user only has to enable it once per session.
  const [voiceSummaryOn, setVoiceSummaryOn] = useState(false);
  const lastSpokenKeyRef = useRef<string | null>(null);

  // Reset the "logged" flag whenever the underlying route pair changes —
  // each new computed route is its own opportunity to log a walk.
  useEffect(() => {
    setLogged(false);
  }, [geo?.pair.id, exposure?.standard.avgAqi, exposure?.atlas.avgAqi]);

  // Derived per-route values. Computed early so the voice-summary effect can
  // depend on them without violating rules-of-hooks (the early-return guard
  // sits below all hook calls).
  const std = geo && exposure
    ? {
        name: 'Standard',
        color: 'red' as const,
        distance_m: geo.routes.standard.distance_m,
        duration_s: geo.routes.standard.duration_s,
        exposure: exposure.standard,
      }
    : null;
  const atlas = geo && exposure
    ? {
        name: 'AirAware',
        color: 'green' as const,
        distance_m: geo.routes.atlas.distance_m,
        duration_s: geo.routes.atlas.duration_s,
        exposure: exposure.atlas,
      }
    : null;

  // AirAware "wins" only if its average AQI is lower than Standard's. Avg AQI
  // is the fair air-quality metric (per-step concentration) — exposure-minutes
  // can be higher on a longer route even when the air is cleaner.
  const atlasCleaner = !!exposure && exposure.atlas.avgAqi < exposure.standard.avgAqi - 1;

  const addedMin = std && atlas
    ? Math.max(0, Math.round((atlas.duration_s - std.duration_s) / 60))
    : 0;
  // Both routes through clean air (AQI < threshold along the entire walk).
  const allClean =
    !!std && !!atlas &&
    std.exposure.exposureMinutes === 0 &&
    atlas.exposure.exposureMinutes === 0;

  const warningText = warningCopy(warning);
  const savings = exposure ? walkSavings(exposure) : null;
  const canLog =
    !!savings && savings.atlasWins &&
    (savings.avoidedAqiMinutes > 0 || savings.avoidedUnhealthyMinutes > 0);

  // Build a short spoken summary tailored to which banner is showing. Reads
  // numbers (not raw AQI) so a screen-reader user gets the same takeaway as
  // a sighted one — "this route is cleaner, take it."
  const summary = (() => {
    if (!std || !atlas || !exposure) return '';
    const stdMin = Math.round(std.duration_s / 60);
    const atlasMin = Math.round(atlas.duration_s / 60);
    if (warningText) {
      return `${warningText} Standard route is ${stdMin} minutes, ${formatDistance(std.distance_m)}.`;
    }
    if (allClean) {
      return `Air looks good for this walk. Both routes are safe — pick whichever fits the day. Standard route is ${stdMin} minutes; AirAware route is ${atlasMin} minutes.`;
    }
    if (atlasCleaner) {
      const delta = Math.round(std.exposure.avgAqi - atlas.exposure.avgAqi);
      const extra = addedMin > 0 ? `, ${addedMin} extra ${addedMin === 1 ? 'minute' : 'minutes'} of walking` : '';
      return `AirAware route is recommended. Averages ${delta} A-Q-I cleaner than the standard route${extra}. Total walk: ${atlasMin} minutes, ${formatDistance(atlas.distance_m)}.`;
    }
    return `Two routes available. Standard is ${stdMin} minutes, AirAware is ${atlasMin} minutes. Air quality is similar across both.`;
  })();

  const summaryKey = geo && exposure
    ? `${geo.pair.id}|${Math.round(exposure.standard.avgAqi)}|${Math.round(exposure.atlas.avgAqi)}`
    : '';

  // Auto-speak the summary when the user has opted in AND the underlying
  // numbers change. Dedupe via summaryKey so a re-render with identical data
  // doesn't restart speech mid-utterance.
  useEffect(() => {
    if (!voiceSummaryOn || !summary) return;
    if (!isSpeechAvailable()) return;
    if (lastSpokenKeyRef.current === summaryKey) return;
    lastSpokenKeyRef.current = summaryKey;
    cancelSpeech();
    speak(summary, locale);
  }, [voiceSummaryOn, summaryKey, summary, locale]);

  // If the user turns voice off, stop any in-flight speech immediately.
  useEffect(() => {
    if (!voiceSummaryOn) cancelSpeech();
  }, [voiceSummaryOn]);

  // Early return AFTER all hooks have been called. Prior bug: the early
  // return sat above the voice-summary hooks, so toggling from null→data
  // changed the hook count and React threw "Rendered more hooks than during
  // the previous render."
  if (!geo || !exposure || !std || !atlas || !savings) return null;

  function toggleVoiceSummary() {
    if (voiceSummaryOn) {
      setVoiceSummaryOn(false);
      return;
    }
    // Force-speak immediately on enable; clearing the key ensures the effect
    // fires even if the same pair was previously narrated.
    lastSpokenKeyRef.current = null;
    setVoiceSummaryOn(true);
  }

  const voiceAvailable = isSpeechAvailable();

  return (
    <div className="space-y-2">
      {/* Headline — four states, in priority order:
          1. Both routes clean → sky "air looks good" banner
          2. AirAware genuinely cleaner (and engine isn't warning) → emerald "averages N AQI cleaner"
          3. Engine warning → amber friendly explanation
          (Otherwise no banner — just the route cards.) */}
      {allClean && !warningText && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900"
        >
          <span className="font-semibold">Air looks good for this walk.</span>{' '}
          <span className="text-sky-700">
            Both routes are below the kid-asthma sensitivity threshold — pick whichever fits
            the day.
          </span>
        </div>
      )}

      {!allClean && atlasCleaner && !warningText && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold">
                AirAware route averages {Math.round(std.exposure.avgAqi - atlas.exposure.avgAqi)} AQI cleaner
              </span>
              {addedMin > 0 && <span className="text-emerald-700"> · +{addedMin} min walk</span>}
              {canLog && (
                <div className="mt-0.5 text-[12px] text-emerald-800">
                  Take it and avoid{' '}
                  <span className="font-semibold">
                    {savings.avoidedAqiMinutes.toLocaleString()} AQI·min
                  </span>
                  {savings.avoidedUnhealthyMinutes > 0 && (
                    <> ({savings.avoidedUnhealthyMinutes} bad-air min)</>
                  )}{' '}
                  of exposure today.
                </div>
              )}
            </div>
            {canLog && (
              <button
                type="button"
                disabled={logged}
                onClick={() => {
                  recordWalk({
                    aqiMinutes: savings.avoidedAqiMinutes,
                    unhealthyMinutes: savings.avoidedUnhealthyMinutes,
                  });
                  setLogged(true);
                }}
                className="shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-emerald-700 disabled:bg-emerald-300"
              >
                {logged ? '✓ Logged' : "I'm taking this route"}
              </button>
            )}
          </div>
        </div>
      )}

      {warningText && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {warningText}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <RouteCard
          route={std}
          kid={activeKid}
          showImpact={showImpact}
          highlight={!atlasCleaner}
        />
        <RouteCard
          route={atlas}
          kid={activeKid}
          highlight={atlasCleaner && !allClean}
          showImpact={showImpact}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowImpact((v) => !v)}
          className="text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          {showImpact ? '▾ Hide lifetime estimate' : '▸ Show lifetime estimate'}
        </button>
        <div className="flex items-center gap-3">
          {voiceAvailable && (
            <button
              type="button"
              onClick={toggleVoiceSummary}
              aria-pressed={voiceSummaryOn}
              aria-label={voiceSummaryOn ? 'Stop reading route summary' : 'Read route summary aloud'}
              className={`text-xs font-medium transition ${
                voiceSummaryOn ? 'text-emerald-700 hover:text-emerald-900' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {voiceSummaryOn ? '🔊 Reading summary' : '🔈 Read summary'}
            </button>
          )}
          <MethodologyButton />
        </div>
      </div>
    </div>
  );
}

function MethodologyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
      >
        How is the cleaner route picked?
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-w-md space-y-3 rounded-2xl border border-emerald-100 bg-white p-5 text-sm text-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900">How AirAware picks routes</h3>
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed">
              <li>
                <span className="font-semibold">Standard route</span> = Mapbox&rsquo;s most direct
                walking path, what Google Maps would show.
              </li>
              <li>
                We try <span className="font-semibold">18 detour candidates</span> by injecting a
                waypoint perpendicular to the corridor at 3 distances × 2 sides × 3 positions
                along the route.
              </li>
              <li>
                Every candidate is sampled every 50 m against a 60,000-cell, 200 m AQI grid
                covering the 5 boroughs (EPA AirNow + PurpleAir).
              </li>
              <li>
                The winner is the candidate with the{' '}
                <span className="font-semibold">fewest minutes through unhealthy air</span>{' '}
                (AQI ≥ 100) — not the lowest average AQI. A longer detour through moderate air
                can have <em>more</em> total bad-air minutes than a shorter one through a brief
                hot spot, so we rank by what your body actually breathes.
              </li>
              <li>
                Ties broken by: lower average AQI, then the most visibly different geometry on
                the map.
              </li>
              <li>
                If <span className="font-semibold">no detour beats the standard</span> on bad-air
                minutes, AirAware says so and the savings line disappears. We won&rsquo;t fake a
                win.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface RouteCardData {
  name: string;
  color: 'red' | 'green';
  distance_m: number;
  duration_s: number;
  exposure: RouteOptions['standard'];
}

function RouteCard({
  route,
  kid,
  highlight = false,
  showImpact,
}: {
  route: RouteCardData;
  kid: { age: number; severity: 'mild' | 'moderate' | 'severe' } | null;
  highlight?: boolean;
  showImpact: boolean;
}) {
  const steps = estimateSteps(route.distance_m, route.duration_s / 60);
  const impact = kid
    ? lifeImpactForWalk({
        exposureMinutes: route.exposure.exposureMinutes,
        maxAqi: route.exposure.maxAqi,
        severity: kid.severity,
        age: kid.age,
      })
    : null;

  const accent =
    route.color === 'red'
      ? 'border-red-200 bg-red-50/70'
      : 'border-emerald-200 bg-emerald-50/70';
  const dot = route.color === 'red' ? 'bg-red-600' : 'bg-emerald-600';

  return (
    <article
      className={`relative rounded-xl border ${accent} p-3 ${highlight ? 'ring-2 ring-emerald-400/60' : ''}`}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
          <span className="text-sm font-semibold text-slate-900">{route.name}</span>
        </div>
        {highlight && (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Recommended
          </span>
        )}
      </header>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat Icon={ClockIcon} label="Walk" value={formatWalkTime(route.duration_s)} />
        <Stat Icon={RulerIcon} label="Distance" value={formatDistance(route.distance_m)} />
        <Stat Icon={StepsIcon} label="Steps" value={`~${steps.toLocaleString()}`} />
      </div>

      <div className="mt-2 rounded-lg bg-white/60 px-2 py-1.5 text-center text-xs">
        <span className="font-semibold text-slate-900">
          Avg AQI {Math.round(route.exposure.avgAqi)}
        </span>{' '}
        <span className="text-slate-600">·</span>{' '}
        <span className="text-slate-600">peak {Math.round(route.exposure.maxAqi)}</span>
      </div>

      {showImpact && impact && (
        <div
          className="mt-1.5 rounded-lg bg-white/40 px-2 py-1 text-center text-[11px] text-slate-700"
          title={impact.tooltip}
        >
          {impact.label}{' '}
          <span className="cursor-help text-slate-400" aria-label={impact.tooltip}>
            ⓘ
          </span>
        </div>
      )}
    </article>
  );
}

function Stat({
  Icon,
  label,
  value,
}: {
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex justify-center text-slate-500" aria-hidden>
        <Icon size={14} />
      </div>
      <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
