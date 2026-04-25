// A continuous-line illustration: a winding path with a small offshoot showing
// the cleaner alternative. Drawn as one stroke to match the cartographic feel.

interface Props {
  size?: number;
  className?: string;
}

export function RouteIcon({ size = 56, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      {/* Faint background contour — paper-noise feel */}
      <path
        d="M4 50 Q 14 38, 22 44 T 40 30 T 60 26"
        stroke="rgb(var(--rule))"
        strokeWidth="1"
        fill="none"
        opacity="0.6"
      />
      {/* Standard route — straight, polluted */}
      <path
        className="ink-line"
        style={{ ['--draw-len' as string]: '90' }}
        d="M10 54 L 54 10"
        strokeDasharray="3 4"
      />
      {/* Atlas route — curves around the hot spot */}
      <path
        className="ink-line ink-line-ember ink-draw"
        style={{ ['--draw-len' as string]: '120' }}
        d="M10 54 Q 18 38, 30 36 Q 42 34, 54 10"
      />
      {/* Endpoints */}
      <circle cx="10" cy="54" r="2.4" fill="rgb(var(--ink))" />
      <circle cx="54" cy="10" r="2.4" fill="rgb(var(--ember))" />
      {/* Pollution hot-spot marker the route avoids */}
      <g opacity="0.9">
        <circle cx="38" cy="46" r="6" fill="none" stroke="rgb(var(--ember))" strokeWidth="0.8" />
        <circle cx="38" cy="46" r="3" fill="none" stroke="rgb(var(--ember))" strokeWidth="0.8" />
        <circle cx="38" cy="46" r="0.8" fill="rgb(var(--ember))" />
      </g>
    </svg>
  );
}
