/**
 * Buyer-facing checkout summary (US-MFTF-12.3). A thin formatter over
 * `planCheckout`: relabels provider groups as "Shipment 1 / 2" and strips the
 * provider key + quote items so nothing identifies the dropshipper.
 */
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";
import { planCheckout, type CheckoutPlan } from "./plan";
import type { CheckoutSummary } from "./types";

/** Pure formatter: plan → buyer-facing summary (no provider identity). */
export function summarizePlan(plan: CheckoutPlan): CheckoutSummary {
  return {
    status: plan.status,
    removed: plan.removed,
    priceChanges: plan.priceChanges,
    groups: plan.groups.map((g, index) => ({
      label: `Shipment ${index + 1}`,
      items: g.items.map((i) => ({
        title: i.title,
        selectionSummary: i.selectionSummary,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
      })),
      shippingMethod: g.shippingMethod,
      shippingCost: g.shippingCost,
    })),
    itemsSubtotal: plan.itemsSubtotal,
    shippingTotal: plan.shippingTotal,
    total: plan.total,
  };
}

export async function buildCheckoutSummary(
  cartId: string,
  address: FulfillmentShippingAddress,
): Promise<CheckoutSummary> {
  return summarizePlan(await planCheckout(cartId, address));
}
