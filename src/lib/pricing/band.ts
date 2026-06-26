// Pure, Prisma-free derivation of the US-landed-cost color band (US-MFTF-19.6).
// Presentational only — the band is recomputed from the stored cost + admin
// thresholds and is never persisted. Safe to import from client components.

export type PriceBand = "green" | "amber" | "red";

export interface BandThresholds {
  /** At or below this (USD cents) the band is green; above it is amber. */
  amberAboveCents: number;
  /** Above this (USD cents) the band is red. */
  redAboveCents: number;
}

/**
 * Derive the band for a US-landed cost in cents. Returns null for an unrecorded
 * (null) cost so callers render a neutral "not recorded" state rather than a
 * misleading band. green ≤ amberAbove < amber ≤ redAbove < red.
 */
export function priceBand(costCents: number | null | undefined, thresholds: BandThresholds): PriceBand | null {
  if (costCents == null) return null;
  if (costCents <= thresholds.amberAboveCents) return "green";
  if (costCents <= thresholds.redAboveCents) return "amber";
  return "red";
}
