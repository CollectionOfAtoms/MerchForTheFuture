import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { DEFAULT_PRODUCT_TAX_CODE, DEFAULT_TAX_BEHAVIOR, isStripeTaxEnabled } from "@/lib/tax/codes";

// Wrap fetch in a lambda so MSW's runtime-patched globalThis.fetch is always called,
// even though the Stripe client is created at module load (before MSW patches fetch).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: "2026-03-25.dahlia" as any,
  httpClient: Stripe.createFetchHttpClient(
    (...args: Parameters<typeof fetch>) => globalThis.fetch(...args)
  ),
});

export { stripe };

export async function createPaymentIntent(orderId: string): Promise<{
  clientSecret: string;
  paymentIntentId: string;
}> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) throw new Error("Order not found.");
  if (order.status === "PAID") throw new Error("Order is already paid.");

  const amountInCents = Math.round(Number(order.totalAmount) * 100);

  const intent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: order.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: { orderId },
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { stripePaymentIntentId: intent.id },
  });

  return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
}

export async function createCheckoutSession(orderId: string): Promise<{
  clientSecret: string;
  sessionId: string;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { buyer: { select: { stripeCustomerId: true } } },
  });

  if (!order) throw new Error("Order not found.");
  if (order.status === "PAID") throw new Error("Order is already paid.");

  const amountInCents = Math.round(Number(order.totalAmount) * 100);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded_page",
    line_items: [
      {
        price_data: {
          currency: order.currency.toLowerCase(),
          product_data: { name: "Artwork purchase", tax_code: DEFAULT_PRODUCT_TAX_CODE },
          unit_amount: amountInCents,
          tax_behavior: DEFAULT_TAX_BEHAVIOR,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    // Stripe Tax (US-5.1), env-gated like the cart flow. See docs/tax-configuration.md.
    automatic_tax: { enabled: isStripeTaxEnabled() },
    billing_address_collection: "required",
    // Attach the buyer's Stripe Customer (US-5.2) so an approved exemption applies.
    ...(order.buyer?.stripeCustomerId
      ? { customer: order.buyer.stripeCustomerId, customer_update: { address: "auto" as const } }
      : {}),
    return_url: `${baseUrl}/orders/${orderId}/fulfill?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { orderId },
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { stripeSessionId: session.id },
  });

  return { clientSecret: session.client_secret!, sessionId: session.id };
}
