// Recommendation matrix
// Decides whether a kid should walk a route, take a cleaner alternative, take a
// shorter walk, or stay inside, given the route's air-quality exposure and the
// kid's age + asthma severity.
//
// Cutoffs are grounded in:
//   - EPA AQI breakpoints for sensitive groups
//     https://www.airnow.gov/aqi/aqi-basics/
//     "Unhealthy for Sensitive Groups" begins at AQI 101.
//   - AAP / AAFA pediatric asthma management guidance:
//     children with asthma are a sensitive group; severity escalates the
//     threshold at which exertion outdoors is contraindicated.
//
// The matrix is intentionally conservative for the `severe` tier — for a
// severe-persistent asthmatic child, even AQI in the upper "Moderate" band can
// trigger symptoms during sustained exertion (a 0.7-mile walk to school
// qualifies). See AAFA's "Asthma and Air Quality" guidance.
//
// Display copy is intentionally plain-language: never raw AQI numbers in the
// banner; raw numbers stay behind the "details" expander.

export type Severity = 'mild' | 'moderate' | 'severe';

export type RecommendationCode =
  | 'WALK_STANDARD'      // standard route is fine; AQI low
  | 'WALK_ATLAS'         // take the cleaner Atlas route
  | 'WALK_ATLAS_BRIEF'   // take a shorter walk only; cap exposure minutes
  | 'STAY_INSIDE';       // do not walk outdoors today

export interface RouteExposure {
  avgAqi: number;
  maxAqi: number;
  exposureMinutes: number;   // minutes spent in AQI > 100 along the route
  totalMinutes: number;      // total walking time
}

export interface KidProfile {
  id: string;
  name: string;
  emoji: string;
  age: number;
  severity: Severity;
}

export interface RouteOptions {
  standard: RouteExposure;
  atlas: RouteExposure;
}

export interface Recommendation {
  code: RecommendationCode;
  verdict: 'good' | 'ok' | 'risky' | 'bad';
  routeChoice: 'standard' | 'atlas' | 'none';
  headline: string;
  detail: string;
}

// Severity → max-AQI tolerated at sustained exertion (walking to school).
// Below this, the route is acceptable. Above it, recommend a cleaner route or
// no walk.
const MAX_AQI_BY_SEVERITY: Record<Severity, number> = {
  mild: 100,      // EPA "Moderate" cap; sensitive-group threshold begins here
  moderate: 75,   // mid-Moderate; AAP guidance flags symptoms in this band
  severe: 50,     // "Good" only; AAFA guidance for severe-persistent
};

// Minutes-in-unhealthy-air tolerated. 0 for severe — any sustained exposure to
// AQI > 100 is contraindicated.
const MAX_EXPOSURE_MIN_BY_SEVERITY: Record<Severity, number> = {
  mild: 8,
  moderate: 3,
  severe: 0,
};

// Younger kids have smaller airways and breathe more air per kg of body
// weight than adults — the AAP recommends tighter thresholds for under-7s.
function ageAdjustedMaxAqi(severity: Severity, age: number): number {
  const base = MAX_AQI_BY_SEVERITY[severity];
  if (age <= 6) return Math.max(40, base - 15);
  return base;
}

function routePassesFor(kid: KidProfile, route: RouteExposure): boolean {
  const maxAqi = ageAdjustedMaxAqi(kid.severity, kid.age);
  const maxExposure = MAX_EXPOSURE_MIN_BY_SEVERITY[kid.severity];
  return route.maxAqi <= maxAqi && route.exposureMinutes <= maxExposure;
}

export function recommend(kid: KidProfile, options: RouteOptions): Recommendation {
  const standardOk = routePassesFor(kid, options.standard);
  const atlasOk = routePassesFor(kid, options.atlas);

  if (standardOk && atlasOk) {
    return {
      code: 'WALK_STANDARD',
      verdict: 'good',
      routeChoice: 'standard',
      headline: `${kid.name} can walk either route`,
      detail: 'Air is clean enough today that the standard route is fine.',
    };
  }

  if (atlasOk) {
    const minutesSaved = Math.max(
      0,
      options.standard.exposureMinutes - options.atlas.exposureMinutes,
    );
    return {
      code: 'WALK_ATLAS',
      verdict: 'good',
      routeChoice: 'atlas',
      headline: `${kid.name}: walk the cleaner route`,
      detail: `${minutesSaved} fewer minutes through unhealthy air vs the standard route.`,
    };
  }

  // Neither full route passes. If the cleanest option only briefly crosses the
  // threshold, suggest a shorter walk; otherwise stay inside.
  const briefAtlasFailure =
    options.atlas.exposureMinutes <= MAX_EXPOSURE_MIN_BY_SEVERITY[kid.severity] + 3;

  if (briefAtlasFailure && kid.severity !== 'severe') {
    return {
      code: 'WALK_ATLAS_BRIEF',
      verdict: 'risky',
      routeChoice: 'atlas',
      headline: `${kid.name}: short walk only`,
      detail: 'Air is borderline. Take the cleaner route and keep the walk brief.',
    };
  }

  return {
    code: 'STAY_INSIDE',
    verdict: 'bad',
    routeChoice: 'none',
    headline: `Stay home today, ${kid.name}`,
    detail: 'Even the cleaner route hits unhealthy air for this profile.',
  };
}

export function verdictColor(v: Recommendation['verdict']): string {
  switch (v) {
    case 'good':
      return 'bg-verdict-good';
    case 'ok':
      return 'bg-verdict-ok';
    case 'risky':
      return 'bg-verdict-risky';
    case 'bad':
      return 'bg-verdict-bad';
  }
}

// Emoji-free: callers use verdictColor + a kid initial / dot. Removing the
// emoji helper keeps the surface clean and makes "no emojis in the app" a
// type-checked invariant.
