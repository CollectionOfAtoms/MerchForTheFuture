"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

type ActionResult = { error: string } | undefined;

export async function initiateBuyNowAction(listingId: string): Promise<ActionResult> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) redirect("/sign-in");

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true },
  });

  if (!listing) return { error: "Listing not found." };
  if (listing.saleType !== "FIXED_PRICE") return { error: "This listing is not a fixed-price listing." };
  if (listing.status !== "ACTIVE") return { error: "This listing is no longer available." };
  if (listing.artwork.sellerId === user.id) return { error: "You cannot buy your own listing." };

  // Reuse existing PENDING order for this buyer+listing if one exists.
  // Clear any stale shipping/session fields so the payment-first flow starts fresh.
  const existing = await prisma.order.findFirst({
    where: { buyerId: user.id, originalListingId: listingId, status: "PENDING" },
  });
  const orderId = existing
    ? (await prisma.order.update({
        where: { id: existing.id },
        data: {
          stripeSessionId: null,
          shippingName: null,
          shippingLine1: null,
          shippingLine2: null,
          shippingCity: null,
          shippingState: null,
          shippingPostal: null,
          shippingCountry: null,
        },
      })).id
    : (await prisma.order.create({
        data: {
          buyerId: user.id,
          listingType: "ORIGINAL",
          originalListingId: listingId,
          subtotal: Number(listing.price),
          taxAmount: 0,
          totalAmount: Number(listing.price),
          currency: listing.currency,
          status: "PENDING",
        },
      })).id;

  redirect(`/checkout/${orderId}`);
}

// ─── Cart checkout (US-MFTF-12.3) ─────────────────────────────────────────────

import { buildCheckoutSummary } from "@/lib/checkout/summary";
import type { CheckoutSummary } from "@/lib/checkout/types";
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";

export type CreateCheckoutResult = { error: string } | { summary: CheckoutSummary };

/**
 * Re-validate the buyer's cart against live data and quote shipping per provider
 * for the given destination address (US-MFTF-12.3). Returns a summary; when
 * `summary.status === "changed"` the buyer must re-confirm before a Stripe session
 * is created (US-MFTF-12.4). Does not mutate orders — only prunes stale cart items.
 */
export async function createCheckoutAction(
  address: FulfillmentShippingAddress,
): Promise<CreateCheckoutResult> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) return { error: "Unauthorized" };

  if (!address?.line1 || !address?.city || !address?.postal || !address?.country) {
    return { error: "A complete shipping address is required to calculate shipping." };
  }

  const cart = await prisma.cart.findUnique({
    where: { userId: user.id },
    include: { _count: { select: { items: true } } },
  });
  if (!cart || cart._count.items === 0) {
    return { error: "Your cart is empty." };
  }

  const summary = await buildCheckoutSummary(cart.id, address);
  return { summary };
}
