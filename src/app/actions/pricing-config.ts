"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PRICING_CONFIG_ID } from "@/lib/pricing/config";

type UpdateResult = { error: string } | { success: true };

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  return Boolean(user?.id && user.roles?.includes("ADMIN"));
}

/**
 * Admin-only upsert of the singleton US-landed-cost band thresholds
 * (US-MFTF-19.6). Inputs are USD dollar amounts; stored as cents. Amber must be
 * strictly below red so the three bands are well-ordered.
 */
export async function updatePricingThresholdsAction(
  _prevState: UpdateResult | undefined,
  formData: FormData,
): Promise<UpdateResult> {
  if (!(await isAdmin())) return { error: "Unauthorized" };

  const amber = parseFloat((formData.get("amberAbove") as string | null) ?? "");
  const red = parseFloat((formData.get("redAbove") as string | null) ?? "");
  if (!isFinite(amber) || amber < 0 || !isFinite(red) || red < 0) {
    return { error: "Thresholds must be non-negative dollar amounts." };
  }
  const amberAboveCents = Math.round(amber * 100);
  const redAboveCents = Math.round(red * 100);
  if (amberAboveCents >= redAboveCents) {
    return { error: "The amber threshold must be below the red threshold." };
  }

  await prisma.pricingConfig.upsert({
    where: { id: PRICING_CONFIG_ID },
    create: { id: PRICING_CONFIG_ID, amberAboveCents, redAboveCents },
    update: { amberAboveCents, redAboveCents },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/teemill-catalog");
  return { success: true };
}
