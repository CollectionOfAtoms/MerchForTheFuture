/**
 * Cart checkout session creation (US-MFTF-12.4). Creates one buyer-facing
 * Order(CART, PENDING) with OrderItem rows (capturing unitPrice) and per-provider
 * FulfillmentOrder rows (PENDING, with quoted shipping), then opens one embedded
 * Stripe Checkout session (Stripe Tax on) with one line per item plus one per
 * shipment group. Provider names never appear — shipping lines are "Shipment N".
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { stripe } from "@/lib/payments/stripe";
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";
import { planCheckout, type CheckoutPlan } from "./plan";
import { DEFAULT_PRODUCT_TAX_CODE, SHIPPING_TAX_CODE, DEFAULT_TAX_BEHAVIOR, isStripeTaxEnabled } from "@/lib/tax/codes";

export interface CartCheckoutResult {
  orderId: string;
  clientSecret: string;
  sessionId: string;
  plan: CheckoutPlan;
}

export interface StripeLineItem {
  price_data: {
    currency: string;
    product_data: { name: string; tax_code: string };
    unit_amount: number;
    tax_behavior: "exclusive" | "inclusive" | "unspecified";
  };
  quantity: number;
}

/**
 * Build the Stripe line items for a cart plan: one per cart item, plus one per
 * shipment group whose shipping cost is > 0. Free shipping (e.g. Teemill bundles
 * shipping into the item cost → $0) adds NO line item — Stripe rejects a $0
 * unit_amount line, and a "$0 shipping" row is noise anyway.
 */
export function buildCartLineItems(plan: CheckoutPlan): StripeLineItem[] {
  const itemLines: StripeLineItem[] = plan.groups.flatMap((g) =>
    g.items.map((i) => ({
      price_data: {
        currency: "usd",
        product_data: { name: `${i.title} (${i.selectionSummary})`.trim(), tax_code: DEFAULT_PRODUCT_TAX_CODE },
        unit_amount: Math.round(i.unitPrice * 100),
        tax_behavior: DEFAULT_TAX_BEHAVIOR,
      },
      quantity: i.quantity,
    })),
  );
  const shippingLines: StripeLineItem[] = plan.groups
    .map((g, index) => ({ g, index }))
    .filter(({ g }) => g.shippingCost > 0)
    .map(({ g, index }) => ({
      price_data: {
        currency: "usd",
        product_data: { name: `Shipment ${index + 1} — shipping`, tax_code: SHIPPING_TAX_CODE },
        unit_amount: Math.round(g.shippingCost * 100),
        tax_behavior: DEFAULT_TAX_BEHAVIOR,
      },
      quantity: 1,
    }));
  return [...itemLines, ...shippingLines];
}

export async function createCartCheckout(
  buyerId: string,
  cartId: string,
  address: FulfillmentShippingAddress,
  precomputedPlan?: CheckoutPlan,
): Promise<CartCheckoutResult> {
  const plan = precomputedPlan ?? (await planCheckout(cartId, address));
  if (plan.groups.length === 0) {
    throw new Error("Your cart has no purchasable items.");
  }

  // Persist the order + rows BEFORE creating the Stripe session, so the webhook
  // always has rows to act on (US-MFTF-12.4 AC). Cart orders leave the legacy
  // single-listing FKs null (app-layer invariant, src/lib/orders/invariants.ts).
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        buyerId,
        listingType: "CART",
        status: "PENDING",
        subtotal: plan.itemsSubtotal,
        taxAmount: 0,
        totalAmount: plan.total,
        currency: "USD",
        shippingName: address.name,
        shippingLine1: address.line1,
        shippingLine2: address.line2 ?? null,
        shippingCity: address.city,
        shippingState: address.state ?? null,
        shippingPostal: address.postal,
        shippingCountry: address.country,
      },
    });

    for (const group of plan.groups) {
      const fulfillment = await tx.fulfillmentOrder.create({
        data: {
          orderId: created.id,
          provider: group.providerKey,
          status: "PENDING",
          shippingMethod: group.shippingMethod,
          shippingCost: group.shippingCost,
        },
      });
      for (const item of group.items) {
        await tx.orderItem.create({
          data: {
            orderId: created.id,
            itemKind: item.kind,
            apparelListingId: item.apparelListingId,
            listingId: item.listingId,
            selection: item.selection as Prisma.InputJsonValue,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            fulfillmentOrderId: fulfillment.id,
          },
        });
      }
    }
    return created;
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const lineItems = buildCartLineItems(plan);

  const session = await stripe.checkout.sessions.create({
    // This stack's Stripe (apiVersion …dahlia) names the embedded UI mode
    // "embedded_page" (not "embedded"); it's a valid UiMode literal here.
    ui_mode: "embedded_page",
    line_items: lineItems,
    mode: "payment",
    // Stripe Tax (US-5.1). Each line carries a tax_behavior + product tax_code
    // (buildCartLineItems); a billing address is collected so Stripe can resolve
    // the jurisdiction. Gated by STRIPE_TAX_ENABLED (default off pre-launch until
    // Dashboard tax registrations exist — see docs/tax-configuration.md). When on,
    // Stripe computes the tax line shown before confirmation; the paid total
    // (incl. tax) is read back from total_details on fulfillment.
    automatic_tax: { enabled: isStripeTaxEnabled() },
    billing_address_collection: "required",
    return_url: `${baseUrl}/orders/${order.id}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { orderId: order.id },
  });

  await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });

  // Diagnostic: confirm the session is a usable embedded session (has a
  // client_secret). A missing client_secret → the embedded checkout shows a
  // generic "Something went wrong" with no client error.
  if (process.env.DROPSHIPPING_DEBUG) {
    console.log("[checkout] stripe session created", {
      id: session.id,
      ui_mode: session.ui_mode,
      status: session.status,
      hasClientSecret: !!session.client_secret,
      lineItemCount: lineItems.length,
      total: plan.total,
    });
  }

  return { orderId: order.id, clientSecret: session.client_secret!, sessionId: session.id, plan };
}
