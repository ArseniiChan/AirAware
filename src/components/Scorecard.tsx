'use client';

// Lifetime savings tile. Shows total walks logged, AQI·minutes avoided as a
// progress bar toward the next milestone, and a generous days-of-life
// estimate. Collapsible — defaults open on first visit so the demo lands.

import { useState } from 'react';
import { useSavingsStore } from '@/store/savings';
import {
  daysOfLifeFromAqiMinutes,
  formatAqiMinutes,
  formatDaysOfLife,
  milestoneProgress,
} from '@/lib/savings';

export function Scorecard() {
  const total = useSavingsStore((s) => s.totalAqiMinutesAvoided);
  const unhealthy = useSavingsStore((s) => s.totalUnhealthyMinutesAvoided);
  const walks = useSavingsStore((s) => s.walksLogged);
  const reset = useSavingsStore((s) => s.reset);
  const [open, setOpen] = useState(true);

  const { current, next, fraction } = milestoneProgress(total);
  const days = daysOfLifeFromAqiMinutes(total);
  const fresh = walks === 0;

  return (
    <section
      className="rounded-2xl border border-emerald-100 bg-white/80 p-3 shadow-sm backdrop-blur"
      aria-label="Your lifetime air-quality savings"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-base">🏆</span>
          <h2 className="text-sm font-semibold text-slate-900">Your clean-air score</h2>
          {walks > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              {walks} {walks === 1 ? 'walk' : 'walks'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-slate-500 hover:text-slate-900"
          aria-expanded={open}
        >
          {open ? '▾' : '▸'}
        </button>
      </header>

      {open && (
        <div className="mt-2 space-y-2">
          {fresh ? (
            <p className="text-xs text-slate-600">
              Take an AirAware route and tap <span className="font-semibold">"I'm taking this route"</span>{' '}
              to start your tally.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat
                  value={formatAqiMinutes(total)}
                  label="AQI·min avoided"
                />
                <Stat
                  value={`${unhealthy}`}
                  label="Bad-air min avoided"
                />
                <Stat
                  value={formatDaysOfLife(days)}
                  label="Est. life back"
                  hint="WHO PM2.5 dose-response, conservative. Compares routes, not absolute risk."
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>{current?.label ?? 'Just starting'}</span>
                  <span className="font-medium text-emerald-700">{next.label}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-emerald-50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all"
                    style={{ width: `${Math.round(fraction * 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{formatAqiMinutes(total)} / {formatAqiMinutes(next.aqiMinutes)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Reset your lifetime savings tally?')) reset();
                    }}
                    className="hover:text-slate-700"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-emerald-50/60 px-2 py-1.5" title={hint}>
      <div className="text-base font-bold text-emerald-700">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-600">{label}</div>
    </div>
  );
}
