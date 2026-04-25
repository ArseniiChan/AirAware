'use client';

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { AddressAutocomplete, type AddressPick } from './AddressAutocomplete';
import { GeolocateError, locateMe } from '@/lib/geolocate';

interface Props {
  step: 1 | 2;
  totalSteps: number;
  eyebrow: string;
  question: string;
  helper?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ctaLabel: string;
  onSubmit: () => void;
  onBack?: () => void;
  presets?: { label: string; value: string; pick?: AddressPick }[];
  /** Recent picks (most-recent first) — rendered as small chips ABOVE presets. */
  recentPicks?: AddressPick[];
  /** When provided, the input becomes a Mapbox autocomplete and `onPick` fires
   *  with [lon, lat] when the user selects a suggestion (or a preset with
   *  baked coordinates). */
  onPick?: (pick: AddressPick) => void;
  /** Display-only: a small confirmation chip when a coordinate is locked. */
  pickedName?: string;
  /** Show "📍 Use my location". Step 1 (origin) only — destination geolocate
   *  doesn't make sense semantically. */
  showGeolocate?: boolean;
}

export function OnboardingStep({
  step,
  totalSteps,
  eyebrow,
  question,
  helper,
  value,
  onChange,
  placeholder,
  ctaLabel,
  onSubmit,
  onBack,
  presets,
  recentPicks,
  onPick,
  pickedName,
  showGeolocate = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    onSubmit();
  }

  async function handleGeolocate() {
    if (!onPick) return;
    setGeoState('loading');
    setGeoError(null);
    try {
      const pick = await locateMe();
      onChange(pick.name);
      onPick(pick);
      setGeoState('idle');
    } catch (err) {
      const msg =
        err instanceof GeolocateError
          ? err.message
          : 'Could not get your location.';
      setGeoError(msg);
      setGeoState('error');
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-50 via-emerald-50 to-sky-50 px-6">
      <div
        key={step}
        className="w-full max-w-md space-y-6"
        style={{ animation: 'air-rise 0.45s ease-out both' }}
      >
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i + 1 === step ? 'w-10 bg-emerald-500' : 'w-4 bg-emerald-200'
              }`}
            />
          ))}
        </div>

        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {question}
          </h1>
          {helper && <p className="mt-2 text-sm text-slate-500">{helper}</p>}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {onPick ? (
            <AddressAutocomplete
              ref={inputRef}
              value={value}
              onChange={(v) => onChange(v)}
              onPick={onPick}
              placeholder={placeholder}
              locked={!!pickedName && pickedName === value}
              presetValues={presets?.map((p) => p.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left text-lg shadow-lg shadow-emerald-100 outline-none ring-emerald-400 transition focus:ring-4"
            />
          ) : (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center text-lg shadow-lg shadow-emerald-100 outline-none ring-emerald-400 transition focus:ring-4"
            />
          )}

          {pickedName && pickedName === value && (
            <p className="text-center text-xs font-medium text-emerald-700">
              ✓ Address pinned
            </p>
          )}

          {showGeolocate && onPick && (
            <div className="text-center">
              <button
                type="button"
                onClick={handleGeolocate}
                disabled={geoState === 'loading'}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
              >
                <span aria-hidden>📍</span>
                {geoState === 'loading' ? 'Locating…' : 'Use my location'}
              </button>
              {geoError && (
                <p className="mt-1.5 text-[11px] text-amber-700">{geoError}</p>
              )}
            </div>
          )}

          {recentPicks && recentPicks.length > 0 && (
            <div>
              <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Recent
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {recentPicks.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      onChange(p.name);
                      if (onPick) onPick(p);
                    }}
                    className="max-w-[14rem] truncate rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
                    title={p.name}
                  >
                    {p.name.split(',')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {presets && presets.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {presets.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    onChange(p.value);
                    if (p.pick && onPick) onPick(p.pick);
                  }}
                  className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={!value.trim()}
            className="w-full rounded-2xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white shadow-xl shadow-emerald-400/40 transition hover:translate-y-[-1px] hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {ctaLabel} →
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="block w-full text-center text-xs font-medium text-slate-400 hover:text-slate-700"
            >
              ← Back
            </button>
          )}
        </form>
      </div>

      <style jsx>{`
        @keyframes air-rise {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
