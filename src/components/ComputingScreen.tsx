'use client';

import { useEffect, useState } from 'react';

interface Props {
  onDone: () => void;
  durationMs?: number;
}

const STAGES = [
  'Sampling 200m AQI grid…',
  'Pulling NYC asthma ER history…',
  'Scoring route alternatives…',
  'Tuning per-kid thresholds…',
  'Forecasting 24 hours ahead…',
];

export function ComputingScreen({ onDone, durationMs = 2800 }: Props) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const stageInterval = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, durationMs / STAGES.length);
    const finishTimer = setTimeout(onDone, durationMs);
    return () => {
      clearInterval(stageInterval);
      clearTimeout(finishTimer);
    };
  }, [onDone, durationMs]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white">
      <div className="relative h-64 w-64">
        {/* Radar pulses */}
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="absolute inset-0 rounded-full border border-emerald-400/60"
            style={{
              animation: `air-pulse 2.4s ease-out ${i * 0.6}s infinite`,
            }}
          />
        ))}
        {/* Sweeping radar arm */}
        <span
          className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 origin-center rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0deg, rgba(74,222,128,0.5) 60deg, transparent 90deg)',
            animation: 'air-sweep 2s linear infinite',
          }}
        />
        {/* Center dot */}
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_24px_rgba(74,222,128,0.9)]" />

        {/* Particle dots floating around the perimeter */}
        {[...Array(8)].map((_, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-emerald-300/80"
            style={{
              transform: `rotate(${i * 45}deg) translate(110px) rotate(-${i * 45}deg)`,
              animation: `air-float 2.4s ease-in-out ${i * 0.15}s infinite alternate`,
            }}
          />
        ))}
      </div>

      <div className="mt-12 h-6 text-sm font-medium tracking-wide text-emerald-200">
        {STAGES[stage]}
      </div>

      <div className="mt-3 flex gap-2">
        {STAGES.map((_, i) => (
          <span
            key={i}
            className={`h-1 w-8 rounded-full transition-all ${
              i <= stage ? 'bg-emerald-400' : 'bg-emerald-900'
            }`}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes air-pulse {
          0% { transform: scale(0.4); opacity: 0.9; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes air-sweep {
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes air-float {
          to { transform: rotate(var(--r, 0deg)) translate(120px) rotate(calc(-1 * var(--r, 0deg))); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
