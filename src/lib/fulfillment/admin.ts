/**
 * Admin dropship exception queue (US-MFTF-15.2, re-homed from US-14.5). The admin's
 * only fulfillment responsibility is retrying FAILED automated-provider shipments —
 * shipping of physical originals moved to the seller (US-MFTF-15.1). Physical
 * originals are excluded explicitly: their `provider === "originals"` shipments never
 * fail, but the filter guarantees they can never surface here.
 */
import { prisma } from "@/lib/db";
import { ORIGINALS_PROVIDER } from "./originals";

export interface DropshipExceptionRow {
  fulfillmentOrderId: string;
  orderId: string;
  buyerName: string;
  notes: string | null;
}

/** FAILED dropship FulfillmentOrders awaiting an admin retry (originals excluded). */
export async function getDropshipExceptionQueue(): Promise<DropshipExceptionRow[]> {
  const failed = await prisma.fulfillmentOrder.findMany({
    where: { status: "FAILED", provider: { not: ORIGINALS_PROVIDER } },
    include: { order: { select: { id: true, buyer: { select: { name: true, email: true } } } } },
    orderBy: { updatedAt: "asc" },
  });
  return failed.map((fo) => ({
    fulfillmentOrderId: fo.id,
    orderId: fo.order.id,
    buyerName: fo.order.buyer.name ?? fo.order.buyer.email,
    notes: fo.notes,
  }));
}

/** Count of dropship exceptions — drives the admin nav badge (originals excluded). */
export async function countDropshipExceptions(): Promise<number> {
  return prisma.fulfillmentOrder.count({
    where: { status: "FAILED", provider: { not: ORIGINALS_PROVIDER } },
  });
}

export interface OriginalOversightRow {
  orderId: string;
  artworkTitle: string;
  sellerName: string;
  buyerName: string;
  shippingCity: string | null;
  shippingCountry: string | null;
  paidAt: Date;
  totalAmount: number;
}

/**
 * Read-only oversight list of ALL sellers' originals awaiting shipment (US-MFTF-15.1
 * oversight). Admins don't ship originals — sellers do — but the site operators need
 * to see which originals are pending and which seller is responsible, to spot stalls.
 * Same "awaiting shipment" filter as the seller queue, across every seller.
 */
export async function getOriginalsAwaitingSellerShipment(): Promise<OriginalOversightRow[]> {
  const orders = await prisma.order.findMany({
    where: {
      listingType: "ORIGINAL",
      status: "PAID",
      shippingLine1: { not: null },
    },
    include: {
      buyer: { select: { name: true, email: true } },
      originalListing: {
        select: { artwork: { select: { title: true, seller: { select: { name: true, email: true } } } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return orders.map((o) => {
    const artwork = o.originalListing?.artwork;
    return {
      orderId: o.id,
      artworkTitle: artwork?.title ?? "Original artwork",
      sellerName: artwork?.seller.name ?? artwork?.seller.email ?? "Unknown seller",
      buyerName: o.buyer.name ?? o.buyer.email,
      shippingCity: o.shippingCity,
      shippingCountry: o.shippingCountry,
      paidAt: o.createdAt,
      totalAmount: Number(o.totalAmount),
    };
  });
}
