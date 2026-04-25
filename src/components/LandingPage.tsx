'use client';

import { useTranslations } from 'next-intl';
import { LanguageToggle } from './LanguageToggle';
import { RouteIcon } from './icons/RouteIcon';
import { KidsIcon } from './icons/KidsIcon';
import { ForecastIcon } from './icons/ForecastIcon';
import { TopoBackground } from './icons/TopoBackground';

interface Props {
  onStart: () => void;
}

export function LandingPage({ onStart }: Props) {
  const t = useTranslations('landing');

  const features = [
    { Icon: RouteIcon,    title: t('feature1Title'), body: t('feature1Body'), n: '01' },
    { Icon: KidsIcon,     title: t('feature2Title'), body: t('feature2Body'), n: '02' },
    { Icon: ForecastIcon, title: t('feature3Title'), body: t('feature3Body'), n: '03' },
  ];

  return (
    <div
      className="paper-grain relative min-h-screen overflow-hidden"
      style={{ background: 'rgb(var(--paper))', color: 'rgb(var(--ink))' }}
    >
      {/* Topographic background */}
      <TopoBackground />

      {/* Top bar — like the running head of a printed page */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-6 pt-7 sm:px-10">
        <div className="flex items-baseline gap-3">
          <span
            className="text-xl font-semibold tracking-tight sm:text-[22px]"
            style={{ fontFamily: 'var(--font-display)', fontVariationSettings: '"opsz" 144, "SOFT" 60' }}
          >
            AirAware
          </span>
          <span
            className="hidden text-[10px] uppercase tracking-[0.22em] sm:inline"
            style={{ fontFamily: 'var(--font-mono)', color: 'rgb(var(--ink-soft))' }}
          >
            {t('place')}
          </span>
        </div>
        <LanguageToggle />
      </header>

      {/* Thin rule under the masthead */}
      <div
        className="relative z-10 mx-auto mt-5 max-w-6xl px-6 sm:px-10"
        aria-hidden
      >
        <div className="h-px w-full" style={{ background: 'rgb(var(--rule))' }} />
      </div>

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-6xl px-6 sm:px-10">
        <div className="grid grid-cols-12 gap-6 pt-12 sm:pt-20">
          {/* Eyebrow / coordinates column */}
          <aside
            className="col-span-12 sm:col-span-3"
            style={{ animation: 'ink-rise 0.7s ease-out 0.05s both' }}
          >
            <p
              className="text-[10px] uppercase leading-relaxed tracking-[0.28em]"
              style={{ fontFamily: 'var(--font-mono)', color: 'rgb(var(--ink-soft))' }}
            >
              {t('eyebrow')}
            </p>
            <p
              className="mt-2 text-[10px] uppercase tracking-[0.22em]"
              style={{ fontFamily: 'var(--font-mono)', color: 'rgb(var(--ember))' }}
            >
              {t('footnoteCoords')}
            </p>
          </aside>

          {/* Headline column */}
          <div
            className="col-span-12 sm:col-span-9"
            style={{ animation: 'ink-rise 0.7s ease-out 0.15s both' }}
          >
            <h1
              className="font-medium tracking-[-0.02em]"
              style={{
                fontFamily: 'var(--font-display)',
                fontVariationSettings: '"opsz" 144, "SOFT" 80',
                fontSize: 'clamp(2.6rem, 7vw, 5.6rem)',
                lineHeight: 0.96,
                color: 'rgb(var(--ink))',
              }}
            >
              <span className="block">{t('headlineLead')}</span>
              <span className="block">{t('headlineMid')}</span>
              <span
                className="block italic"
                style={{ color: 'rgb(var(--ember))', fontVariationSettings: '"opsz" 144, "SOFT" 100' }}
              >
                {t('headlineEnd')}
              </span>
            </h1>

            <p
              className="mt-8 max-w-xl text-[17px] leading-[1.55]"
              style={{
                color: 'rgb(var(--ink-soft))',
                animation: 'ink-rise 0.7s ease-out 0.3s both',
              }}
            >
              {t('lede')}
            </p>

            <div
              className="mt-12 flex flex-wrap items-baseline gap-x-8 gap-y-4"
              style={{ animation: 'ink-rise 0.7s ease-out 0.45s both' }}
            >
              <button
                type="button"
                onClick={onStart}
                className="cta-underline group inline-flex items-baseline gap-3 text-[22px] font-medium"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontVariationSettings: '"opsz" 144, "SOFT" 80',
                  color: 'rgb(var(--ink))',
                }}
              >
                <span>{t('cta')}</span>
                <svg
                  width="32"
                  height="14"
                  viewBox="0 0 32 14"
                  className="transition-transform group-hover:translate-x-1"
                  aria-hidden
                >
                  <path
                    d="M0 7 L 28 7 M 22 1 L 30 7 L 22 13"
                    stroke="rgb(var(--ember))"
                    strokeWidth="1.4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <p
                className="max-w-sm text-[12px] leading-relaxed"
                style={{ fontFamily: 'var(--font-mono)', color: 'rgb(var(--ink-soft))' }}
              >
                {t('ctaHint')}
              </p>
            </div>
          </div>
        </div>

        {/* Features — printed-page section list */}
        <section
          className="mt-24 grid grid-cols-12 gap-y-10 gap-x-6 pb-16 sm:mt-32"
          style={{ animation: 'ink-rise 0.7s ease-out 0.6s both' }}
        >
          <header className="col-span-12">
            <div className="flex items-baseline gap-4">
              <span
                className="text-[10px] uppercase tracking-[0.28em]"
                style={{ fontFamily: 'var(--font-mono)', color: 'rgb(var(--ink-soft))' }}
              >
                §
              </span>
              <span
                className="h-px flex-1"
                style={{ background: 'rgb(var(--rule))' }}
                aria-hidden
              />
            </div>
          </header>

          {features.map(({ Icon, title, body, n }) => (
            <article
              key={n}
              className="col-span-12 flex flex-col gap-3 sm:col-span-4"
            >
              <div className="flex items-baseline justify-between">
                <span
                  className="text-[10px] uppercase tracking-[0.22em]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'rgb(var(--ink-soft))' }}
                >
                  {n}
                </span>
                <Icon size={48} />
              </div>
              <h3
                className="mt-2 text-[20px] font-medium tracking-tight"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontVariationSettings: '"opsz" 36, "SOFT" 60',
                }}
              >
                {title}
              </h3>
              <p
                className="text-[14px] leading-[1.6]"
                style={{ color: 'rgb(var(--ink-soft))' }}
              >
                {body}
              </p>
            </article>
          ))}
        </section>

        {/* Footer line — like a colophon */}
        <footer
          className="relative pb-10"
          style={{ animation: 'ink-rise 0.7s ease-out 0.75s both' }}
        >
          <div className="h-px w-full" style={{ background: 'rgb(var(--rule))' }} />
          <p
            className="mt-4 text-[11px] leading-relaxed"
            style={{ fontFamily: 'var(--font-mono)', color: 'rgb(var(--ink-soft))' }}
          >
            {t('footnoteData')}
          </p>
        </footer>
      </main>
    </div>
  );
}
