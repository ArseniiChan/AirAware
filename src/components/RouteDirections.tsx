'use client';

// Turn-by-turn directions — the visual fallback list AND the surface for the
// voice-guided mode (Plan §1 NICE-TO-HAVE). Speech-synthesis support is
// feature-detected; if absent, the play button hides itself entirely and the
// list works as a static reference.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { isSpeechAvailable, speak, cancelSpeech, waitForVoices } from '@/lib/voiceMode';
import { formatDistance } from '@/lib/healthMath';
import type { RouteStep } from '@/lib/routesData';

interface Props {
  steps: RouteStep[];
  /** Tinted accent (red for standard, emerald for atlas). */
  tone: 'standard' | 'atlas';
}

export function RouteDirections({ steps, tone }: Props) {
  const locale = useLocale();
  const [speechReady, setSpeechReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  // Voice list often populates async on Chrome/Safari. Wait once on mount
  // so the play button only enables when speech is actually usable.
  useEffect(() => {
    if (!isSpeechAvailable()) return;
    waitForVoices().then(() => setSpeechReady(true));
  }, []);

  // Cancel any in-flight narration on unmount or step swap.
  useEffect(() => {
    return () => { cancelledRef.current = true; cancelSpeech(); };
  }, [steps]);

  async function play() {
    if (!isSpeechAvailable() || playing) return;
    cancelledRef.current = false;
    setPlaying(true);
    for (let i = 0; i < steps.length; i++) {
      if (cancelledRef.current) break;
      setActiveIdx(i);
      const distance = formatDistance(steps[i].distance_m);
      // Wrap "in 200 ft" / "for 0.3 mi" into the spoken phrase. The Mapbox
      // instruction already includes direction + street, so we just append
      // distance as the prosody hint a real navigation app gives.
      const phrase = `${steps[i].instruction} ${distance}.`;
      await speak(phrase, locale);
    }
    if (!cancelledRef.current) setActiveIdx(null);
    setPlaying(false);
  }

  function stop() {
    cancelledRef.current = true;
    cancelSpeech();
    setPlaying(false);
    setActiveIdx(null);
  }

  if (!steps || steps.length === 0) return null;

  const accent =
    tone === 'standard'
      ? 'border-red-200 bg-red-50/50'
      : 'border-emerald-200 bg-emerald-50/50';
  const dot = tone === 'standard' ? 'bg-red-600' : 'bg-emerald-600';
  const title = tone === 'standard' ? 'Standard route' : 'AirAware route';

  return (
    <div className={`rounded-xl border ${accent} p-3`}>
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            {title} · {steps.length} steps
          </span>
        </div>
        {speechReady && (
          <button
            type="button"
            onClick={playing ? stop : play}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              playing
                ? 'bg-slate-900 text-white hover:bg-slate-700'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            aria-pressed={playing}
            aria-label={playing ? 'Stop narration' : 'Play directions out loud'}
          >
            {playing ? '◼ Stop' : '▶ Play directions'}
          </button>
        )}
      </header>

      <ol className="mt-2 space-y-1">
        {steps.map((s, i) => {
          const isActive = activeIdx === i;
          return (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-lg px-2 py-1 text-xs leading-snug transition ${
                isActive
                  ? 'bg-emerald-100 text-emerald-950 ring-1 ring-emerald-400'
                  : 'text-slate-700'
              }`}
            >
              <span className="mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full bg-white text-[9px] font-bold text-slate-600 ring-1 ring-slate-300">
                {i + 1}
              </span>
              <span className="flex-1">
                {s.instruction}{' '}
                <span className="text-slate-500">· {formatDistance(s.distance_m)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
