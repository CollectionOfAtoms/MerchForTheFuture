"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { placeBid } from "@/lib/auctions/bid";
import { sendOutbidEmail } from "@/lib/payments/email";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type ActionResult = { error: string } | { success: true; newBid: number };

async function requireBuyer() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("BUYER")) redirect("/");
  return user.id;
}

export async function placeBidAction(auctionId: string, amount: number): Promise<ActionResult> {
  const bidderId = await requireBuyer();

  // Capture previous high bidder before the bid goes in
  const auctionBefore = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { currentBidderId: true },
  });

  try {
    await placeBid({ auctionId, bidderId, amount });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to place bid." };
  }

  // Send outbid email to the displaced bidder (if any, and different from current buyer)
  const previousBidderId = auctionBefore?.currentBidderId;
  if (previousBidderId && previousBidderId !== bidderId) {
    await sendOutbidEmail(previousBidderId, auctionId, amount).catch(() => {
      // Non-fatal: email failure must never block bid success
    });
  }

  revalidatePath(`/artwork`);
  return { success: true, newBid: amount };
}
