// Two abstract figures at different scales — one tall, one shorter — sketched
// with continuous curves. The taller figure has an ember halo (the kid for whom
// the air is too risky today); the shorter figure is plain ink.

interface Props {
  size?: number;
  className?: string;
}

export function KidsIcon({ size = 56, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      {/* Ground line */}
      <path d="M6 54 L 58 54" stroke="rgb(var(--rule))" strokeWidth="1" fill="none" />

      {/* Taller figure (left) — at-risk, ember halo */}
      <g>
        <circle
          cx="22"
          cy="20"
          r="9"
          fill="none"
          stroke="rgb(var(--ember))"
          strokeWidth="0.6"
          opacity="0.5"
        />
        <circle cx="22" cy="20" r="4.5" className="ink-line" />
        <path
          className="ink-line ink-draw"
          style={{ ['--draw-len' as string]: '70' }}
          d="M22 25 L 22 44 M22 30 L 14 38 M22 30 L 30 38 M22 44 L 17 54 M22 44 L 27 54"
        />
      </g>

      {/* Shorter figure (right) — fine to walk, plain ink */}
      <g>
        <circle cx="44" cy="28" r="3.5" className="ink-line" />
        <path
          className="ink-line ink-draw"
          style={{ ['--draw-len' as string]: '54' }}
          d="M44 32 L 44 46 M44 36 L 38 42 M44 36 L 50 42 M44 46 L 40 54 M44 46 L 48 54"
        />
      </g>
    </svg>
  );
}
