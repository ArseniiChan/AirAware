// Block-level pediatric asthma ED context — lookup helpers for BlockContextCard.
//
// Data is the JSON Person A's `scripts/ingest_er.py` produces. We import it
// directly so the card never has a loading state or a network failure mode
// (offline-safe demo per plan §1). The file is ~2 KB; the bundle hit is
// negligible. The same file is also served at `/data/er-by-zcta.json` for
// any consumer that prefers a runtime fetch (e.g., the choropleth nice-to-have).
//
// Coverage is 12 NYC ZCTAs picked to match Person C's AQI fixture set. A
// freely-typed address whose ZIP isn't in coverage gets the citywide
// fallback copy — accurate, useful, never empty.

import erDataRaw from '../../public/data/er-by-zcta.json';

export interface ErZctaRow {
  name: string;
  borough: string | null;
  rate_per_10k_children: number;
  visits: number;
  ratio_to_nyc_avg: number;
  one_in_n: number;
}

interface ErByZcta {
  schema_version: number;
  generated_at: string;
  source: string;
  indicator?: string;
  period?: string;
  nyc_avg_per_10k: number;
  zctas: Record<string, ErZctaRow>;
}

const erData: ErByZcta = erDataRaw as ErByZcta;

// Storyteller's home block. Mott Haven (10454) lands the "1 in 24" pitch line.
// Used when the card has no address to work with — keeps the demo honest
// instead of showing zeros.
export const HERO_DEFAULT_ZCTA = '10454';

const NYC_ZIP_REGEX = /\b1[01][0-9]{3}\b/;

const HERO_ADDRESS_OVERRIDES: Record<string, string> = {
  // The Hunts Point Ave & Bruckner Blvd intersection sits on the 10454/10474
  // border; the storyteller's stoop is on the Mott Haven (10454) side. The
  // pitch beat "1 in 24 kids on your block" only lands for 10454 (10474 is
  // "1 in 25"). Other consumers (page.tsx HERO_FROM_PICK.zcta, demo-routes.json
  // pair.from.zcta) honestly label the address as 10474 because that's where
  // Mapbox geocodes it; this override fires only inside the BlockContextCard
  // resolution chain, so the data layer stays unmodified.
  'Hunts Point Ave & Bruckner Blvd, Bronx, NY': '10454',
};

function heroOverrideFor(address: string | undefined | null): string | null {
  if (!address) return null;
  return HERO_ADDRESS_OVERRIDES[address.trim()] ?? null;
}

export function extractZctaFromAddress(address: string | undefined | null): string | null {
  if (!address) return null;
  const override = heroOverrideFor(address);
  if (override) return override;
  const match = address.match(NYC_ZIP_REGEX);
  return match ? match[0] : null;
}

// Final resolution chain consumed by BlockContextCard. The hero-address
// override wins over an explicit `zcta` input so a teammate plumbing
// fromPick.zcta='10474' for the boundary intersection still lands the pitch.
export function resolveZcta(
  address: string | undefined | null,
  explicitZcta: string | undefined | null,
): string {
  const heroOverride = heroOverrideFor(address);
  if (heroOverride) return heroOverride;
  if (explicitZcta) return explicitZcta;
  const fromAddress = extractZctaFromAddress(address);
  if (fromAddress) return fromAddress;
  return HERO_DEFAULT_ZCTA;
}

export function lookupByZcta(zcta: string): ErZctaRow | null {
  return erData.zctas[zcta] ?? null;
}

export function getNycAvgPer10k(): number {
  return erData.nyc_avg_per_10k;
}

export function getNycAvgOneInN(): number {
  return Math.round(10_000 / erData.nyc_avg_per_10k);
}
