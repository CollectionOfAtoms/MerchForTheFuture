import { prisma } from "@/lib/db";
import { stripe } from "./stripe";
import { sendPurchaseConfirmation } from "./email";
import { clearUserCart } from "@/lib/cart/cart";

const PLATFORM_FEE_RATE = 0.10;
const STRIPE_RATE = 0.029;
const STRIPE_FIXED_CENTS = 0.30;

// ─── Shared fulfillment logic ─────────────────────────────────────────────────

async function runFulfillment(orderId: string, chargeRef: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      originalListing: { include: { artwork: true } },
      buyer: true,
    },
  });

  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (order.status === "PAID") return;

  const gross = Number(order.totalAmount);
  const platformFee = Number((gross * PLATFORM_FEE_RATE).toFixed(2));
  const processingFee = Number((gross * STRIPE_RATE + STRIPE_FIXED_CENTS).toFixed(2));
  const netPayout = Number((gross - platformFee - processingFee).toFixed(2));

  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } }),
    prisma.transaction.create({
      data: {
        orderId: order.id,
        stripeChargeId: chargeRef,
        grossAmount: gross,
        platformFee,
        processingFee,
        netPayout,
        currency: order.currency,
      },
    }),
    ...(order.listingType === "ORIGINAL" && order.originalListingId
      ? [prisma.originalListing.update({ where: { id: order.originalListingId }, data: { status: "SOLD" } })]
      : []),
  ]);

  // Cart checkout (US-MFTF-12.4): empty the buyer's cart on payment. Per-shipment
  // fulfillment fan-out through each FulfillmentOrder is dispatched in US-MFTF-12.5.
  if (order.listingType === "CART") {
    await clearUserCart(order.buyerId);
    await sendPurchaseConfirmation(order.id);
    return;
  }

  if (order.listingType === "PRINT" && order.originalListingId) {
    const listing = await prisma.originalListing.findUnique({
      where: { id: order.originalListingId },
    });
    if (listing?.printSourceImageUrl && order.externalSku && order.shippingName) {
      try {
        const apiKey = process.env.PRODIGI_API_KEY ?? "test_key";
        const base = process.env.PRODIGI_API_BASE_URL ?? "https://api.prodigi.com/v4.0";
        const response = await fetch(`${base}/orders`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            shippingMethod: "Standard",
            recipient: {
              name: order.shippingName ?? "",
              address: {
                line1: order.shippingLine1 ?? "",
                townOrCity: order.shippingCity ?? "",
                stateOrCounty: order.shippingState ?? "",
                postalOrZipCode: order.shippingPostal ?? "",
                countryCode: order.shippingCountry ?? "US",
              },
            },
            items: [
              {
                sku: order.externalSku,
                copies: order.quantity,
                sizing: "fillPrintArea",
                assets: [{ printArea: "default", url: listing.printSourceImageUrl }],
              },
            ],
          }),
        });
        const data = (await response.json()) as { order?: { id: string } };
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "PROCESSING", externalOrderId: data.order?.id ?? null },
        });
      } catch (err) {
        console.error("[webhook] Prodigi order creation failed:", err);
      }
    }
  }

  await sendPurchaseConfirmation(order.id);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Called by the payment_intent.succeeded webhook (legacy path). */
export async function fulfillPayment(paymentIntentId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (!order) throw new Error(`Order not found for paymentIntentId: ${paymentIntentId}`);
  await runFulfillment(order.id, paymentIntentId);
}

/** Called by the checkout.session.completed webhook (new path). */
export async function fulfillPaymentBySession(
  sessionId: string,
  orderId: string
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found.");
  if (order.status === "PAID") return;

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") {
    throw new Error("Payment not completed for this session.");
  }

  await runFulfillment(orderId, sessionId);
}

/**
 * Called server-side when the fulfillment page loads with ?session_id=...
 * Synchronously fulfills the order so the confirmation view renders immediately.
 * No-ops if the session ID doesn't match the stored one, or if already paid.
 */
export async function resolveSessionFulfillment(
  orderId: string,
  sessionId: string
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  if (order.stripeSessionId !== sessionId) return;
  if (order.status === "PAID") return;

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return;

  await runFulfillment(orderId, sessionId);
}
