"use client";

import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useCallback } from "react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

interface PaymentFormProps {
  orderId: string;
  amount: number;
  currency: string;
}

export default function PaymentForm({ orderId, amount, currency }: PaymentFormProps) {
  const fetchClientSecret = useCallback(async () => {
    const res = await fetch("/api/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json() as { clientSecret?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to initialize payment.");
    return data.clientSecret!;
  }, [orderId]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">
        Amount due:{" "}
        <span className="font-semibold">
          {Number(amount).toLocaleString("en-US", {
            style: "currency",
            currency: currency,
            maximumFractionDigits: 0,
          })}
        </span>
      </p>
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
