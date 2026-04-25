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
  // Index of the step that has been spoken most recently. -1 = nothing yet.
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  // True while the synthesizer is actively producing audio for a step.
  const [speaking, setSpeaking] = useState(false);
  const cancelledRef = useRef(false);

  // Voice list often populates async on Chrome/Safari. Wait once on mount
  // so the play button only enables when speech is actually usable.
  useEffect(() => {
    if (!isSpeechAvailable()) return;
    waitForVoices().then(() => setSpeechReady(true));
  }, []);

  // Cancel any in-flight narration on unmount or step swap. Reset index too —
  // a new route deserves a fresh walk-through.
  useEffect(() => {
    setCurrentIdx(-1);
    setSpeaking(false);
    return () => { cancelledRef.current = true; cancelSpeech(); };
  }, [steps]);

  async function speakStep(idx: number) {
    if (!isSpeechAvailable() || speaking) return;
    if (idx < 0 || idx >= steps.length) return;
    cancelledRef.current = false;
    setSpeaking(true);
    setCurrentIdx(idx);
    const distance = formatDistance(steps[idx].distance_m);
    // Mapbox instruction already includes direction + street; append distance
    // as the prosody hint a real navigation app gives.
    const phrase = `${steps[idx].instruction} ${distance}.`;
    try {
      await speak(phrase, locale);
    } finally {
      if (!cancelledRef.current) setSpeaking(false);
    }
  }

  function next() {
    speakStep(currentIdx + 1);
  }
  function restart() {
    cancelledRef.current = true;
    cancelSpeech();
    setCurrentIdx(-1);
    setSpeaking(false);
  }
  function repeat() {
    if (currentIdx < 0) return;
    cancelledRef.current = true;
    cancelSpeech();
    setSpeaking(false);
    // Microtask gap so the previous utterance fully cancels before the next
    // request — Safari sometimes drops the new one otherwise.
    setTimeout(() => speakStep(currentIdx), 50);
  }

  if (!steps || steps.length === 0) return null;

  const atEnd = currentIdx >= steps.length - 1;
  const nextLabel = currentIdx < 0
    ? `▶ Start directions`
    : atEnd
      ? `✓ End of route`
      : `▶ Next step (${currentIdx + 2}/${steps.length})`;

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
          <div className="flex items-center gap-1.5">
            {currentIdx >= 0 && !atEnd && (
              <button
                type="button"
                onClick={repeat}
                disabled={speaking}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                aria-label="Repeat current step"
              >
                ↻
              </button>
            )}
            {currentIdx >= 0 && (
              <button
                type="button"
                onClick={restart}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                aria-label="Restart directions from the beginning"
              >
                ⟲
              </button>
            )}
            <button
              type="button"
              onClick={atEnd ? restart : next}
              disabled={speaking}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                atEnd
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              } disabled:opacity-60`}
              aria-label={atEnd ? 'Start over from the first step' : 'Speak the next step'}
            >
              {speaking ? '🔊 Speaking…' : nextLabel}
            </button>
          </div>
        )}
      </header>

      <ol className="mt-2 space-y-1" aria-label="Turn-by-turn directions">
        {steps.map((s, i) => {
          const isActive = currentIdx === i;
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
