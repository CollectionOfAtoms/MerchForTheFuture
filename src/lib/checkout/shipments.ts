/**
 * Per-shipment status (US-MFTF-12.6): a daily reconciliation that polls each
 * provider for dispatch + tracking and a buyer-facing order view that groups
 * items by shipment ("Shipment 1 of 2") without ever naming the provider.
 */
import { prisma } from "@/lib/db";
import { getProviderByKey } from "@/lib/fulfillment";
import { sendShipmentShippedEmail } from "@/lib/payments/email";

const MATERIAL_LABELS: Record<string, string> = { FAP: "Fine Art Paper", CAN: "Stretched Canvas" };

function printSummary(sku: string): string {
  const parts = sku.split("-");
  const material = MATERIAL_LABELS[parts[1]] ?? parts[1] ?? "Print";
  const size = (parts[2] ?? "").replace(/X/i, "x");
  return size ? `${material} · ${size}` : material;
}

/**
 * Aggregate buyer-facing status for a cart order: "Shipped" only once every
 * shipment has shipped, otherwise "Processing".
 */
export function aggregateOrderStatus(fulfillmentStatuses: string[]): "Processing" | "Shipped" {
  if (fulfillmentStatuses.length > 0 && fulfillmentStatuses.every((s) => s === "SHIPPED")) {
    return "Shipped";
  }
  return "Processing";
}

/**
 * Poll every placed-but-not-yet-shipped FulfillmentOrder for dispatch + tracking
 * via the provider's checkFulfillmentStatus(), mark shipped ones SHIPPED, and send
 * a per-shipment email. Scheduled reconciliation (daily cron) — not a per-request
 * call. Failure-isolated per shipment.
 */
export async function checkAndSyncShipments(): Promise<{ checked: number; shipped: number }> {
  const fos = await prisma.fulfillmentOrder.findMany({
    where: { status: "CONFIRMED", providerOrderId: { not: null } },
    select: { id: true, provider: true, providerOrderId: true },
  });

  let shipped = 0;
  for (const fo of fos) {
    try {
      const provider = getProviderByKey(fo.provider);
      const status = await provider.checkFulfillmentStatus({ provider: fo.provider, providerOrderId: fo.providerOrderId });
      if (status.shipped && status.trackingNumber) {
        await prisma.fulfillmentOrder.update({
          where: { id: fo.id },
          data: { status: "SHIPPED", trackingNumber: status.trackingNumber, carrier: status.carrier },
        });
        await sendShipmentShippedEmail(fo.id).catch((e) =>
          console.error(`[shipments] shipped email failed for ${fo.id}`, e),
        );
        shipped++;
      }
    } catch (err) {
      console.error(`[shipments] status check failed for ${fo.id}`, err);
    }
  }
  return { checked: fos.length, shipped };
}

export interface ShipmentLine {
  title: string;
  selectionSummary: string;
  quantity: number;
}

export interface ShipmentView {
  /** "Shipment 1 of 2" — never the provider name. */
  label: string;
  status: string;
  trackingNumber: string | null;
  carrier: string | null;
  items: ShipmentLine[];
}

export interface OrderShipmentsView {
  id: string;
  aggregateStatus: "Processing" | "Shipped";
  shipments: ShipmentView[];
}

/**
 * Buyer-facing view of a cart order grouped by shipment. Returns null if the order
 * isn't the buyer's or carries no shipments (legacy single-item orders).
 */
export async function getOrderShipmentsView(orderId: string, buyerId: string): Promise<OrderShipmentsView | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: {
      fulfillmentOrders: {
        orderBy: { createdAt: "asc" },
        include: {
          items: {
            include: {
              apparelListing: { select: { title: true } },
              originalListing: { select: { artwork: { select: { title: true } } } },
            },
          },
        },
      },
    },
  });
  if (!order || order.fulfillmentOrders.length === 0) return null;

  const total = order.fulfillmentOrders.length;
  const shipments: ShipmentView[] = order.fulfillmentOrders.map((fo, idx) => ({
    label: `Shipment ${idx + 1} of ${total}`,
    status: fo.status,
    trackingNumber: fo.trackingNumber,
    carrier: fo.carrier,
    items: fo.items.map((it) => {
      if (it.itemKind === "APPAREL") {
        const sel = it.selection as { colorId?: string; sizeLabel?: string };
        return {
          title: it.apparelListing?.title ?? "Apparel",
          selectionSummary: [sel.colorId, sel.sizeLabel].filter(Boolean).join(" · "),
          quantity: it.quantity,
        };
      }
      const sel = it.selection as { prodigiSku?: string };
      return {
        title: it.originalListing?.artwork?.title ?? "Print",
        selectionSummary: printSummary(sel.prodigiSku ?? ""),
        quantity: it.quantity,
      };
    }),
  }));

  return {
    id: order.id,
    aggregateStatus: aggregateOrderStatus(order.fulfillmentOrders.map((f) => f.status)),
    shipments,
  };
}
