'use client';

// Always-visible per-route metrics: walk time, distance, steps, time through
// unhealthy air, and a small lifetime-impact estimate. Sits between the map
// and the kid recommendation panel.

import { useMemo, useState } from 'react';
import { useKidsStore } from '@/store/kids';
import {
  estimateSteps,
  formatDistance,
  formatWalkTime,
  lifeImpactForWalk,
} from '@/lib/healthMath';
import type { RouteOptions } from '@/lib/recommendation';
import type { DemoRoutesPayload } from '@/lib/routesData';

interface Props {
  /** Geometry + distance/duration. Source of truth for steps + walk time. */
  geo: DemoRoutesPayload | null;
  /** Per-time-slice exposure stats. Drives "minutes through unhealthy air"
   *  and the life-impact estimate. */
  exposure: RouteOptions | null;
}

export function RouteSummaryCards({ geo, exposure }: Props) {
  const activeKidId = useKidsStore((s) => s.activeKidId);
  const kids = useKidsStore((s) => s.kids);
  const activeKid = useMemo(
    () => kids.find((k) => k.id === activeKidId) ?? kids[0] ?? null,
    [kids, activeKidId],
  );
  const [showImpact, setShowImpact] = useState(false);

  if (!geo || !exposure) return null;

  const std = {
    name: 'Standard',
    color: 'red' as const,
    distance_m: geo.routes.standard.distance_m,
    duration_s: geo.routes.standard.duration_s,
    exposure: exposure.standard,
  };
  const atlas = {
    name: 'AirAware',
    color: 'green' as const,
    distance_m: geo.routes.atlas.distance_m,
    duration_s: geo.routes.atlas.duration_s,
    exposure: exposure.atlas,
  };

  const exposureSavedMin = Math.max(
    0,
    Math.round((std.exposure.exposureMinutes - atlas.exposure.exposureMinutes) * 10) / 10,
  );
  const addedMin = Math.max(
    0,
    Math.round((atlas.duration_s - std.duration_s) / 60),
  );

  return (
    <div className="space-y-2">
      {/* Headline savings — the "why bother" line, kid-named when one is active */}
      {exposureSavedMin > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span className="font-semibold">
            {activeKid ? `${activeKid.name}: ` : ''}AirAware saves {exposureSavedMin} min
          </span>{' '}
          through unhealthy air
          {addedMin > 0 && <span className="text-emerald-700"> · +{addedMin} min walk</span>}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <RouteCard
          route={std}
          kid={activeKid}
          showImpact={showImpact}
        />
        <RouteCard
          route={atlas}
          kid={activeKid}
          highlight
          showImpact={showImpact}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowImpact((v) => !v)}
        className="text-xs font-medium text-slate-500 hover:text-slate-900"
      >
        {showImpact ? '▾ Hide lifetime estimate' : '▸ Show lifetime estimate'}
      </button>
    </div>
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
        <Stat icon="⏱️" label="Walk" value={formatWalkTime(route.duration_s)} />
        <Stat icon="📏" label="Distance" value={formatDistance(route.distance_m)} />
        <Stat icon="👟" label="Steps" value={`~${steps.toLocaleString()}`} />
      </div>

      <div className="mt-2 rounded-lg bg-white/60 px-2 py-1.5 text-center text-xs">
        <span className="font-semibold text-slate-900">
          {route.exposure.exposureMinutes} min
        </span>{' '}
        <span className="text-slate-600">through unhealthy air</span>
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

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div>
      <div className="text-base leading-none" aria-hidden>{icon}</div>
      <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
