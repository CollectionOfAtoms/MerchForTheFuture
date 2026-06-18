import { describe, it, expect } from "vitest";
import type { CheckoutPlan } from "@/lib/checkout/plan";

const { buildCartLineItems } = await import("@/lib/checkout/session");

function plan(groups: CheckoutPlan["groups"]): CheckoutPlan {
  const itemsSubtotal = groups.reduce((s, g) => s + g.items.reduce((x, i) => x + i.lineTotal, 0), 0);
  const shippingTotal = groups.reduce((s, g) => s + g.shippingCost, 0);
  return { status: "ok", removed: [], priceChanges: [], groups, itemsSubtotal, shippingTotal, total: itemsSubtotal + shippingTotal };
}

function group(providerKey: string, shippingCost: number, title: string, unitPrice: number): CheckoutPlan["groups"][number] {
  return {
    providerKey,
    shippingMethod: "standard",
    shippingCost,
    options: [{ method: "standard", cost: shippingCost }],
    items: [{
      cartItemId: `c-${title}`, kind: "APPAREL", providerKey, title, selectionSummary: "white · M",
      unitPrice, quantity: 1, lineTotal: unitPrice, quoteItem: { quantity: 1 },
      apparelListingId: "a", listingId: null, selection: {},
    }],
  };
}

describe("US-MFTF-12.4 — Stripe line items", () => {
  it("emits one line per item plus one per shipment group with shipping > 0", () => {
    const lines = buildCartLineItems(plan([group("prodigi", 4.99, "Tee", 35), group("teemill", 3.99, "Hoodie", 40)]));
    // 2 items + 2 shipping lines
    expect(lines).toHaveLength(4);
    const shipping = lines.filter((l) => l.price_data.product_data.name.includes("Shipping") || l.price_data.product_data.name.includes("shipping"));
    expect(shipping.map((l) => l.price_data.unit_amount).sort()).toEqual([399, 499]);
  });

  it("omits the shipping line for a free ($0) shipment (Stripe rejects unit_amount 0)", () => {
    const lines = buildCartLineItems(plan([
      group("teemill", 0, "Tee", 35),     // free shipping (Teemill bundles it)
      group("prodigi", 4.99, "Print", 40),
    ]));
    // 2 item lines + only ONE shipping line (the $4.99 prodigi one)
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.price_data.unit_amount > 0)).toBe(true);
    const shipping = lines.filter((l) => l.price_data.product_data.name.toLowerCase().includes("shipping"));
    expect(shipping).toHaveLength(1);
    expect(shipping[0].price_data.unit_amount).toBe(499);
  });

  it("never emits a zero-amount line item", () => {
    const lines = buildCartLineItems(plan([group("teemill", 0, "Tee", 35)]));
    expect(lines).toHaveLength(1); // just the item; no $0 shipping line
    expect(lines[0].price_data.unit_amount).toBe(3500);
  });
});
