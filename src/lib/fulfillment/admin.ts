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
