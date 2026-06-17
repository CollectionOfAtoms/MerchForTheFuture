import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout — Merch for the Future",
};

/**
 * Placeholder cart-checkout route (US-MFTF-11.4). The multi-item Stripe checkout
 * lands in Epic MFTF-12; until then "Proceed to checkout" reaches this 404-safe
 * "coming soon" page rather than a dead link. (The per-order /checkout/[orderId]
 * flow for originals/auctions is unrelated and unaffected.)
 */
export default function CheckoutComingSoonPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-stone-900">Checkout is coming soon</h1>
      <p className="mt-3 text-stone-600">
        Cart checkout isn&apos;t quite ready yet. Your cart is saved — come back shortly to complete your order.
      </p>
      <Link
        href="/cart"
        className="mt-6 inline-block rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-stone-500"
      >
        Back to cart
      </Link>
    </main>
  );
}
