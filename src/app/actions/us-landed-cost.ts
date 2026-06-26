"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type Result = { error: string } | { success: true };

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  return Boolean(user?.id && user.roles?.includes("ADMIN"));
}

/**
 * Set (or clear) the founder-recorded US-landed cost on a referenced listing
 * (US-MFTF-19.5). ADMIN-only: this is a curation datum the admin owns; sellers see
 * it read-only. Value is a USD dollar string ("" clears it to null/not-recorded);
 * stored as integer cents. Never enters any pricing/checkout/margin path.
 */
export async function setUsLandedCostAction(listingId: string, value: string): Promise<Result> {
  if (!(await isAdmin())) return { error: "Unauthorized" };

  const listing = await prisma.apparelListing.findUnique({
    where: { id: listingId },
    select: { id: true, sourcingMode: true },
  });
  if (!listing || listing.sourcingMode !== "REFERENCED") return { error: "Listing not found." };

  const trimmed = (value ?? "").trim();
  let usLandedCost: number | null = null;
  if (trimmed !== "") {
    const dollars = parseFloat(trimmed);
    if (!isFinite(dollars) || dollars < 0) {
      return { error: "US-landed cost must be a non-negative dollar amount." };
    }
    usLandedCost = Math.round(dollars * 100);
  }

  await prisma.apparelListing.update({ where: { id: listingId }, data: { usLandedCost } });
  revalidatePath("/admin/teemill-catalog");
  return { success: true };
}
