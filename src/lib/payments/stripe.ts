import Stripe from "stripe";
import { prisma } from "@/lib/db";

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
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) throw new Error("Order not found.");
  if (order.status === "PAID") throw new Error("Order is already paid.");

  const amountInCents = Math.round(Number(order.totalAmount) * 100);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ui_mode: "embedded_page" as any,
    line_items: [
      {
        price_data: {
          currency: order.currency.toLowerCase(),
          product_data: { name: "Artwork purchase" },
          unit_amount: amountInCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    return_url: `${baseUrl}/orders/${orderId}/fulfill?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { orderId },
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { stripeSessionId: session.id },
  });

  return { clientSecret: session.client_secret!, sessionId: session.id };
}
