import { prisma } from "@/lib/db";
import type { BandThresholds } from "./band";

/** The singleton row id — there is only ever one PricingConfig. */
export const PRICING_CONFIG_ID = "default";

/** Sensible starting thresholds until a founder configures them ($15 / $25). */
export const DEFAULT_THRESHOLDS: BandThresholds = {
  amberAboveCents: 1500,
  redAboveCents: 2500,
};

/**
 * The admin-configured US-landed-cost band thresholds, or DEFAULT_THRESHOLDS when
 * none have been set yet. Single source of truth for both the admin catalog view
 * and the seller surface (US-MFTF-19.6).
 */
export async function getPricingConfig(): Promise<BandThresholds> {
  const row = await prisma.pricingConfig.findUnique({ where: { id: PRICING_CONFIG_ID } });
  if (!row) return DEFAULT_THRESHOLDS;
  return { amberAboveCents: row.amberAboveCents, redAboveCents: row.redAboveCents };
}
