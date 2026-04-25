// A clock face crossed by a wind/breath line that swoops through the dial.
// The clock hand points to "4" — the demo flip moment ("walk at 4pm").

interface Props {
  size?: number;
  className?: string;
}

export function ForecastIcon({ size = 56, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      {/* Dial */}
      <circle cx="32" cy="32" r="20" className="ink-line" />
      {/* Tick marks at 12, 3, 6, 9 */}
      <path
        d="M32 14 L 32 17 M50 32 L 47 32 M32 50 L 32 47 M14 32 L 17 32"
        className="ink-line"
        strokeWidth="1.6"
      />
      {/* Clock hands — pointing roughly to "4" */}
      <path
        className="ink-line"
        d="M32 32 L 32 22"
      />
      <path
        className="ink-line ink-line-ember"
        d="M32 32 L 44 38"
        strokeWidth="1.8"
      />
      {/* Center pivot */}
      <circle cx="32" cy="32" r="1.5" fill="rgb(var(--ink))" />

      {/* Wind/breath sweep through the dial */}
      <path
        className="ink-line ink-line-ember ink-draw"
        style={{ ['--draw-len' as string]: '110', strokeDasharray: '110' }}
        d="M4 24 Q 18 20, 32 30 T 60 36"
        opacity="0.7"
      />
      {/* A second softer sweep for layered air */}
      <path
        d="M6 44 Q 20 40, 34 48 T 58 50"
        stroke="rgb(var(--rule))"
        strokeWidth="1"
        fill="none"
        opacity="0.7"
      />
    </svg>
  );
}
