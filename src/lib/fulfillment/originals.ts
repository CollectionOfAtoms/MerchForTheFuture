/**
 * Seller-owned fulfillment for physical originals (US-MFTF-15.1).
 *
 * Originals are legacy single-listing Orders (`listingType === "ORIGINAL"`, no
 * OrderItem/FulfillmentOrder rows). To ship them through the SAME seam as the
 * automated dropship lifecycle (US-MFTF-14.2 `applyFulfillmentTransition` + the
 * US-MFTF-14.3 lifecycle emails) — and so the buyer page renders them uniformly
 * (US-MFTF-15.3) — each original is represented by a single FulfillmentOrder with
 * `provider = "originals"`. This needs NO schema change: `provider` is free text and
 * the row carries no OrderItem (the email/shipments view fall back to the parent
 * order's artwork). Such a shipment is never dispatched (`dispatchOrderFulfillment`
 * runs for CART only), never polled (`checkAndSyncShipments` requires a
 * `providerOrderId`), and never FAILED, so it never enters the admin exception queue.
 */
import { prisma } from "@/lib/db";

/** The synthetic provider key used for seller-shipped physical originals. */
export const ORIGINALS_PROVIDER = "originals";

/**
 * Idempotently return (creating if absent) the single `originals` FulfillmentOrder
 * for an ORIGINAL order. Created at the canonical PROCESSING base (`CONFIRMED`) so a
 * subsequent SHIPPED/DELIVERED transition advances the monotonic ladder.
 */
export async function ensureOriginalFulfillmentOrder(orderId: string) {
  const existing = await prisma.fulfillmentOrder.findFirst({
    where: { orderId, provider: ORIGINALS_PROVIDER },
  });
  if (existing) return existing;
  return prisma.fulfillmentOrder.create({
    data: { orderId, provider: ORIGINALS_PROVIDER, status: "CONFIRMED", shippingCost: 0 },
  });
}

export interface SellerOriginalRow {
  orderId: string;
  title: string;
  thumbnailUrl: string | null;
  buyerName: string;
  shippingName: string | null;
  shippingLine1: string | null;
  shippingLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostal: string | null;
  shippingCountry: string | null;
  totalAmount: number;
  paidAt: Date;
}

/**
 * The seller's own paid, address-confirmed, not-yet-shipped original-artwork orders.
 * Seller-locked by `originalListing.artwork.sellerId`. Dropship items never appear
 * (only `listingType === "ORIGINAL"`); once shipped the Order leaves `PAID` and so
 * drops out naturally (the "not yet shipped" filter).
 */
export async function getSellerOriginalsQueue(sellerId: string): Promise<SellerOriginalRow[]> {
  const orders = await prisma.order.findMany({
    where: {
      listingType: "ORIGINAL",
      status: "PAID",
      shippingLine1: { not: null },
      originalListing: { artwork: { sellerId } },
    },
    include: {
      buyer: { select: { name: true, email: true } },
      originalListing: {
        select: {
          artwork: {
            select: {
              title: true,
              images: { where: { isPrimary: true }, take: 1, select: { thumbnailUrl: true, gridUrl: true, url: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return orders.map((o) => {
    const artwork = o.originalListing?.artwork;
    const image = artwork?.images[0];
    return {
      orderId: o.id,
      title: artwork?.title ?? "Original artwork",
      thumbnailUrl: image?.thumbnailUrl ?? image?.gridUrl ?? image?.url ?? null,
      buyerName: o.buyer.name ?? o.buyer.email,
      shippingName: o.shippingName,
      shippingLine1: o.shippingLine1,
      shippingLine2: o.shippingLine2,
      shippingCity: o.shippingCity,
      shippingState: o.shippingState,
      shippingPostal: o.shippingPostal,
      shippingCountry: o.shippingCountry,
      totalAmount: Number(o.totalAmount),
      paidAt: o.createdAt,
    };
  });
}
