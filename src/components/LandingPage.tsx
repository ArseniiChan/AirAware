'use client';

import { LanguageToggle } from './LanguageToggle';

interface Props {
  onStart: () => void;
}

const FEATURES = [
  { emoji: '🟢', title: 'Cleaner routes', body: 'We re-route around the worst pollution block by block.' },
  { emoji: '👧', title: 'Per-kid guidance', body: 'Maya walks today. Aiden stays inside. The thresholds are personal.' },
  { emoji: '⏱', title: 'Forecast-aware', body: 'Bad now? See when the air clears. Walk at four instead.' },
];

// Decorative floating dots — pure aesthetic, no semantic meaning.
const FLOAT_DOTS = [
  { left: '8%',  top: '12%', size: 14, color: 'bg-emerald-300/60', delay: '0s'   },
  { left: '14%', top: '78%', size: 22, color: 'bg-sky-300/50',     delay: '1.2s' },
  { left: '22%', top: '38%', size: 8,  color: 'bg-emerald-400/50', delay: '0.6s' },
  { left: '76%', top: '22%', size: 18, color: 'bg-emerald-200/70', delay: '0.3s' },
  { left: '88%', top: '64%', size: 12, color: 'bg-sky-200/70',     delay: '1.8s' },
  { left: '64%', top: '84%', size: 24, color: 'bg-emerald-300/40', delay: '0.9s' },
  { left: '40%', top: '8%',  size: 10, color: 'bg-sky-300/60',     delay: '1.5s' },
  { left: '92%', top: '38%', size: 6,  color: 'bg-emerald-400/60', delay: '2.1s' },
];

export function LandingPage({ onStart }: Props) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50 to-sky-50">
      {/* Decorative floating dots */}
      {FLOAT_DOTS.map((d, i) => (
        <span
          key={i}
          className={`pointer-events-none absolute rounded-full blur-[1px] ${d.color}`}
          style={{
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
            animation: `air-drift 6s ease-in-out ${d.delay} infinite alternate`,
          }}
        />
      ))}

      {/* Soft radial glow behind the hero */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60"
        style={{
          background: 'radial-gradient(closest-side, rgba(74,222,128,0.25), rgba(74,222,128,0) 70%)',
        }}
      />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-6">
        <div className="text-sm font-bold tracking-wide text-emerald-700">AirAware</div>
        <LanguageToggle />
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-72px)] max-w-2xl flex-col items-center justify-center px-6 text-center">
        <div style={{ animation: 'air-rise 0.6s ease-out both' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">
            Asthma-aware navigation · NYC
          </p>
          <h1 className="mt-4 text-5xl font-bold tracking-tight text-slate-900 sm:text-7xl">
            <span className="bg-gradient-to-br from-emerald-600 to-sky-600 bg-clip-text text-transparent">
              AirAware
            </span>
          </h1>
          <p className="mt-5 text-lg text-slate-600 sm:text-xl">
            Like Google Maps — but it knows your kid has asthma.
          </p>
        </div>

        <button
          type="button"
          onClick={onStart}
          className="group relative mt-12 inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-10 py-5 text-lg font-semibold text-white shadow-2xl shadow-emerald-400/40 transition hover:translate-y-[-2px] hover:bg-emerald-700"
          style={{ animation: 'air-rise 0.6s ease-out 0.15s both' }}
        >
          {/* Pulsing ring */}
          <span className="absolute inset-0 rounded-2xl border-2 border-emerald-400" style={{ animation: 'air-cta-pulse 2.4s ease-out infinite' }} />
          <span className="relative">Get Started</span>
          <span className="relative ml-2 transition group-hover:translate-x-1">→</span>
        </button>

        <p className="mt-3 text-xs text-slate-400" style={{ animation: 'air-rise 0.6s ease-out 0.3s both' }}>
          No login. Type two addresses. Built for the Bronx, works across NYC.
        </p>

        <ul
          className="mt-16 grid w-full grid-cols-1 gap-4 sm:grid-cols-3"
          style={{ animation: 'air-rise 0.6s ease-out 0.45s both' }}
        >
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="rounded-2xl border border-emerald-100 bg-white/70 p-4 text-left shadow-sm backdrop-blur"
            >
              <div className="text-xl" aria-hidden>{f.emoji}</div>
              <h3 className="mt-2 text-sm font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{f.body}</p>
            </li>
          ))}
        </ul>
      </main>

      <style jsx>{`
        @keyframes air-rise {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes air-drift {
          from { transform: translate(0, 0)     scale(1);   }
          to   { transform: translate(8px, -14px) scale(1.15); }
        }
        @keyframes air-cta-pulse {
          0%   { transform: scale(1);    opacity: 0.6; }
          100% { transform: scale(1.18); opacity: 0;   }
        }
      `}</style>
    </div>
  );
}
