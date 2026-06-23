import { prisma } from "@/lib/db";
import { stripe } from "./stripe";
import { sendPurchaseConfirmation, sendCartPurchaseConfirmation, sendSellerSaleNotificationEmail } from "./email";
import { clearUserCart } from "@/lib/cart/cart";
import { dispatchOrderFulfillment } from "@/lib/checkout/fanout";

const PLATFORM_FEE_RATE = 0.10;
const STRIPE_RATE = 0.029;
const STRIPE_FIXED_CENTS = 0.30;

// ─── Shared fulfillment logic ─────────────────────────────────────────────────

/** Tax read back from a paid Stripe session's total_details (US-5.1). */
interface SessionTaxInfo {
  /** Tax collected, in dollars. */
  taxAmount: number;
  /** Effective rate (tax / subtotal), 0–1. */
  taxRate: number | null;
  /** Jurisdiction name from the Stripe breakdown, if present. */
  jurisdiction: string | null;
  /** True charged total (items + shipping + tax), in dollars. */
  amountTotal: number | null;
}

/**
 * Extract the Stripe-computed tax from a retrieved Checkout Session. Returns
 * undefined when Stripe Tax was off (no total_details / no tax) so the legacy
 * no-tax path is untouched.
 */
function extractTaxInfo(
  session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>,
  subtotal: number,
): SessionTaxInfo | undefined {
  const amountTaxCents = session.total_details?.amount_tax;
  if (amountTaxCents == null || amountTaxCents <= 0) return undefined;
  const taxAmount = amountTaxCents / 100;
  const amountTotal = session.amount_total != null ? session.amount_total / 100 : null;
  const breakdown = session.total_details?.breakdown?.taxes?.[0];
  const jurisdiction =
    (breakdown?.rate as { jurisdiction?: string; display_name?: string } | undefined)?.jurisdiction ??
    (breakdown?.rate as { jurisdiction?: string; display_name?: string } | undefined)?.display_name ??
    null;
  const taxRate = subtotal > 0 ? Number((taxAmount / subtotal).toFixed(4)) : null;
  return { taxAmount, taxRate, jurisdiction, amountTotal };
}

async function runFulfillment(
  orderId: string,
  chargeRef: string,
  taxInfo?: SessionTaxInfo,
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      originalListing: { include: { artwork: true } },
      buyer: true,
    },
  });

  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (order.status === "PAID") return;

  // When Stripe Tax computed a tax line, the charged total is the session's
  // amount_total (items + shipping + tax); fall back to subtotal + tax.
  const gross = taxInfo
    ? taxInfo.amountTotal ?? Number(order.totalAmount) + taxInfo.taxAmount
    : Number(order.totalAmount);
  const platformFee = Number((gross * PLATFORM_FEE_RATE).toFixed(2));
  const processingFee = Number((gross * STRIPE_RATE + STRIPE_FIXED_CENTS).toFixed(2));
  const netPayout = Number((gross - platformFee - processingFee).toFixed(2));

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: taxInfo
        ? {
            status: "PAID",
            taxAmount: taxInfo.taxAmount,
            taxRate: taxInfo.taxRate,
            taxJurisdiction: taxInfo.jurisdiction,
            totalAmount: gross,
          }
        : { status: "PAID" },
    }),
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
    // Fan out each shipment group to its provider (US-MFTF-12.5), failure-isolated.
    await dispatchOrderFulfillment(order.id);
    await sendCartPurchaseConfirmation(order.id);
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

  // Physical originals are shipped by the seller (US-MFTF-15.1) — notify them that a
  // sale needs shipping (US-MFTF-15.4). Best-effort: never blocks the buyer email.
  if (order.listingType === "ORIGINAL") {
    await sendSellerSaleNotificationEmail(order.id).catch((e) =>
      console.error("[seller-sale email] failed", e),
    );
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

  await runFulfillment(orderId, sessionId, extractTaxInfo(session, Number(order.subtotal)));
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

  await runFulfillment(orderId, sessionId, extractTaxInfo(session, Number(order.subtotal)));
}
