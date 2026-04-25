// Inline SVG icons. Keep the API tiny so call-sites stay readable.
//
// Why not lucide-react: adds ~1.5MB to deps, we use ≤10 icons. Inline beats
// a tree-shaken icon library every time at this scale.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...rest,
  };
}

export function ClockIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function RulerIcon(p: IconProps) {
  // Diagonal ruler avoids confusing horizontal-line look at small sizes.
  return (
    <svg {...base(p)}>
      <path d="M3 17 L17 3 L21 7 L7 21 Z" />
      <path d="M9 9 l2 2 M12 6 l2 2 M6 12 l2 2 M15 3 l2 2 M3 15 l2 2" />
    </svg>
  );
}

export function StepsIcon(p: IconProps) {
  // Two stylized footprints.
  return (
    <svg {...base(p)} fill="currentColor" stroke="none">
      <ellipse cx="8" cy="9" rx="2.5" ry="3.5" />
      <ellipse cx="16" cy="14" rx="2.5" ry="3.5" />
    </svg>
  );
}

export function WindIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 9h11a3 3 0 1 0-3-3" />
      <path d="M3 15h15a3 3 0 1 1-3 3" />
      <path d="M3 12h7" />
    </svg>
  );
}

export function HazeIcon(p: IconProps) {
  // Three horizontal strokes evoke smog / particulate haze.
  return (
    <svg {...base(p)}>
      <path d="M3 8h18" opacity="0.6" />
      <path d="M5 12h14" />
      <path d="M3 16h18" opacity="0.6" />
    </svg>
  );
}

export function PinIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function SunIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export function SunriseIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v6 M5.6 9.6l1.4 1.4 M17 11l1.4-1.4 M2 17h20 M12 6l3 3M12 6l-3 3" />
      <path d="M5 17a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function SunsetIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 9V3 M5.6 9.6l1.4 1.4 M17 11l1.4-1.4 M2 17h20 M12 9l3-3M12 9l-3-3" />
      <path d="M5 17a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function AlertIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5 M12 16h.01" />
    </svg>
  );
}

export function HomeIcon(p: IconProps) {
  // Used as a STAY HOME glyph on the overlay (red banner already conveys severity).
  return (
    <svg {...base(p)}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}
