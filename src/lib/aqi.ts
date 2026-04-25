// Plain-language helpers for AQI values.
// The recommendation banner never shows raw AQI; this is for the "details"
// expander and tooltips only.

export type AqiBand = 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very-unhealthy' | 'hazardous';

export function aqiBand(aqi: number): AqiBand {
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'sensitive';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'very-unhealthy';
  return 'hazardous';
}

export function aqiBandLabel(aqi: number): string {
  switch (aqiBand(aqi)) {
    case 'good':
      return 'Good for kids';
    case 'moderate':
      return 'OK for most kids';
    case 'sensitive':
      return 'Risky for kids with asthma';
    case 'unhealthy':
    case 'very-unhealthy':
    case 'hazardous':
      return 'Stay inside';
  }
}
