/**
 * Per-shipment status (US-MFTF-12.6): a daily reconciliation that polls each
 * provider for dispatch + tracking and a buyer-facing order view that groups
 * items by shipment ("Shipment 1 of 2") without ever naming the provider.
 */
import { prisma } from "@/lib/db";
import { getProviderByKey } from "@/lib/fulfillment";
import { applyFulfillmentTransition } from "@/lib/fulfillment/status";

const MATERIAL_LABELS: Record<string, string> = { FAP: "Fine Art Paper", CAN: "Stretched Canvas" };

function printSummary(sku: string): string {
  const parts = sku.split("-");
  const material = MATERIAL_LABELS[parts[1]] ?? parts[1] ?? "Print";
  const size = (parts[2] ?? "").replace(/X/i, "x");
  return size ? `${material} · ${size}` : material;
}

/**
 * Aggregate buyer-facing status for a cart order: "Shipped" only once every
 * shipment is shipped-or-beyond (SHIPPED or DELIVERED), otherwise "Processing".
 */
export function aggregateOrderStatus(fulfillmentStatuses: string[]): "Processing" | "Shipped" {
  if (fulfillmentStatuses.length > 0 && fulfillmentStatuses.every((s) => s === "SHIPPED" || s === "DELIVERED")) {
    return "Shipped";
  }
  return "Processing";
}

/**
 * Poll every in-flight FulfillmentOrder (placed, not yet terminal) for its current
 * provider status via `checkFulfillmentStatus()`, and feed the canonical status
 * through the shared transition seam (US-MFTF-14.2) — which applies the monotonic
 * guard, persists tracking on SHIPPED, and fires the per-shipment lifecycle email
 * exactly once. This is the Teemill detection path (polling) and also reconciles
 * Prodigi; the Prodigi webhook path (US-MFTF-14.1) drives the SAME seam. Scheduled
 * reconciliation (daily cron) — failure-isolated per shipment.
 * TODO: replace Teemill polling with a webhook once the payload shape is confirmed live.
 */
export async function checkAndSyncShipments(): Promise<{ checked: number; shipped: number }> {
  const fos = await prisma.fulfillmentOrder.findMany({
    // Poll everything still in-flight (not terminal, not yet DELIVERED) so PRINTING,
    // SHIPPED and DELIVERED transitions are all detected — not just the first ship.
    where: { status: { in: ["CONFIRMED", "PRINTING", "SHIPPED"] }, providerOrderId: { not: null } },
    select: { id: true, provider: true, providerOrderId: true },
  });

  let shipped = 0;
  for (const fo of fos) {
    try {
      const provider = getProviderByKey(fo.provider);
      const result = await provider.checkFulfillmentStatus({ provider: fo.provider, providerOrderId: fo.providerOrderId });
      // null = the raw provider status matched no known mapping → already logged a
      // parse warning in the provider; never a silent transition.
      const canonical = result.status ?? (result.shipped ? "SHIPPED" : null);
      if (!canonical) continue;
      const transition = await applyFulfillmentTransition(fo.id, canonical, {
        trackingNumber: result.trackingNumber,
        carrier: result.carrier,
      });
      if (transition.transitioned && transition.status === "SHIPPED") shipped++;
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
