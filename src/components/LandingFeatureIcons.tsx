// Landing-page feature card icons. Distinct from the toolkit in
// `icons/Icons.tsx` because they're slightly more illustrative.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 22, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...rest,
  };
}

// Two stylized routes diverging — green path bypasses a hot patch.
export function RouteIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 19c2 0 3-2 5-2s3 2 5 2 4-2 4-4-2-3-4-3-3 1-5 1-3-2-5-2-4 2-4 4 2 4 4 4z" opacity="0.4" />
      <path d="M5 19c2-3 4-5 7-5s5 2 7 5" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" />
      <circle cx="19" cy="19" r="1.6" fill="currentColor" />
    </svg>
  );
}

// Adult silhouette next to a smaller child silhouette — represents per-kid guidance.
export function KidsIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="9" cy="6" r="2.5" />
      <path d="M5 21v-5a4 4 0 0 1 8 0v5" />
      <circle cx="17" cy="9" r="2" />
      <path d="M14 21v-3a3 3 0 0 1 6 0v3" />
    </svg>
  );
}

// Cloud over a line graph — air-quality forecast over time.
export function ForecastIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M7 10a4 4 0 0 1 8 0 3 3 0 0 1 0 6H7a3 3 0 0 1 0-6z" />
      <path d="M5 20l3-2 3 1 3-3 4 1" />
    </svg>
  );
}
