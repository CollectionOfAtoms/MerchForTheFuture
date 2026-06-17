"use client";

import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useCallback } from "react";
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";
import { createCartCheckoutSessionAction } from "@/app/actions/checkout";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

/**
 * Embedded Stripe checkout for the cart (US-MFTF-12.4). `fetchClientSecret` calls
 * the server action with `confirmed: true` (the buyer has already acknowledged any
 * changes in CheckoutClient), which creates the Order + rows and the session.
 */
export default function CartPaymentForm({ address }: { address: FulfillmentShippingAddress }) {
  const fetchClientSecret = useCallback(async () => {
    const result = await createCartCheckoutSessionAction(address, { confirmed: true });
    if ("clientSecret" in result) return result.clientSecret;
    throw new Error("error" in result ? result.error : "Could not start payment.");
  }, [address]);

  return (
    <div className="mt-4">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
