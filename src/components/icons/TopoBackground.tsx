// Decorative topographic-line background. Hand-tuned curves that loosely echo
// a contour map of the Bronx hugging the East River. Pure aesthetic — no data.

export function TopoBackground() {
  return (
    <svg
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
      style={{ animation: 'contour-breath 18s ease-in-out infinite' }}
    >
      <g
        fill="none"
        stroke="rgb(var(--rule))"
        strokeWidth="0.7"
        opacity="0.55"
      >
        <path d="M-50 130 C 220 80, 460 200, 700 140 S 1080 60, 1280 180" />
        <path d="M-50 200 C 200 160, 480 280, 720 220 S 1100 140, 1280 260" />
        <path d="M-50 280 C 240 230, 500 360, 740 300 S 1120 220, 1280 340" />
        <path d="M-50 360 C 180 320, 440 440, 700 380 S 1080 320, 1280 420" />
        <path d="M-50 440 C 220 400, 460 520, 720 460 S 1100 400, 1280 500" />
        <path d="M-50 520 C 200 480, 480 600, 740 540 S 1120 480, 1280 580" />
        <path d="M-50 600 C 240 560, 500 680, 700 620 S 1080 560, 1280 660" />
        <path d="M-50 680 C 180 640, 440 760, 720 700 S 1100 640, 1280 740" />
      </g>
      {/* A handful of darker contours to hint at "denser" pollution territory */}
      <g
        fill="none"
        stroke="rgb(var(--ember))"
        strokeWidth="0.5"
        opacity="0.18"
      >
        <ellipse cx="280" cy="430" rx="120" ry="55" />
        <ellipse cx="280" cy="430" rx="80" ry="36" />
        <ellipse cx="280" cy="430" rx="44" ry="20" />
      </g>
    </svg>
  );
}
