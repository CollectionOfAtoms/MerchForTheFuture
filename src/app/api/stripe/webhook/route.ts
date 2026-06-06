import { NextResponse } from "next/server";
import { stripe } from "@/lib/payments/stripe";
import { fulfillPayment, fulfillPaymentBySession } from "@/lib/payments/webhook";

export const config = { api: { bodyParser: false } };

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? "");
  } catch (err) {
    console.error("[webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    try {
      await fulfillPayment(paymentIntent.id);
    } catch (err) {
      console.error("[webhook] fulfillPayment failed:", err);
      return NextResponse.json({ error: "Fulfillment failed" }, { status: 500 });
    }
  }

  if (event.type === "checkout.session.completed") {
    const checkoutSession = event.data.object;
    const orderId = checkoutSession.metadata?.orderId;
    if (orderId) {
      try {
        await fulfillPaymentBySession(checkoutSession.id, orderId);
      } catch (err) {
        console.error("[webhook] fulfillPaymentBySession failed:", err);
        return NextResponse.json({ error: "Fulfillment failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
