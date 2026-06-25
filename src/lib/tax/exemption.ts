import { prisma } from "@/lib/db";
import type { TaxExemptionCertificate } from "@/generated/prisma/client";

/**
 * Buyer tax-exemption status (US-5.2). Under Stripe Tax the exemption is enforced
 * by Stripe (the buyer's Customer `tax_exempt` flag), set when an admin approves a
 * certificate. These helpers read the approval record for display + to stamp the
 * applied certificate onto an order; they do not compute tax.
 */

/** The buyer's currently-approved certificate, if any. */
export async function getActiveCertificate(
  userId: string,
): Promise<TaxExemptionCertificate | null> {
  return prisma.taxExemptionCertificate.findFirst({
    where: { userId, status: "APPROVED" },
    orderBy: { reviewedAt: "desc" },
  });
}

/** True when the buyer has an approved exemption certificate. */
export async function isTaxExempt(userId: string): Promise<boolean> {
  return (await getActiveCertificate(userId)) !== null;
}

/** The buyer's latest certificate of any status (for the settings UI). */
export async function getLatestCertificate(
  userId: string,
): Promise<TaxExemptionCertificate | null> {
  return prisma.taxExemptionCertificate.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
