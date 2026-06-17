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

export interface CartCheckoutResult {
  orderId: string;
  clientSecret: string;
  sessionId: string;
  plan: CheckoutPlan;
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
  const lineItems = [
    ...plan.groups.flatMap((g) =>
      g.items.map((i) => ({
        price_data: {
          currency: "usd",
          product_data: { name: `${i.title} (${i.selectionSummary})`.trim() },
          unit_amount: Math.round(i.unitPrice * 100),
        },
        quantity: i.quantity,
      })),
    ),
    ...plan.groups.map((_, index) => ({
      price_data: {
        currency: "usd",
        product_data: { name: `Shipment ${index + 1} — shipping` },
        unit_amount: Math.round(plan.groups[index].shippingCost * 100),
      },
      quantity: 1,
    })),
  ];

  const session = await stripe.checkout.sessions.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ui_mode: "embedded_page" as any,
    line_items: lineItems,
    mode: "payment",
    automatic_tax: { enabled: true },
    return_url: `${baseUrl}/orders/${order.id}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { orderId: order.id },
  });

  await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });

  return { orderId: order.id, clientSecret: session.client_secret!, sessionId: session.id, plan };
}
