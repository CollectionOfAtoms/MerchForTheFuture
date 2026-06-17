import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveCartForRead } from "@/lib/cart/request";
import { getCartView } from "@/lib/cart/cart";
import CheckoutClient from "@/components/CheckoutClient";

export const metadata: Metadata = {
  title: "Checkout — Merch for the Future",
};

// Per-visitor and price-sensitive — never cache.
export const dynamic = "force-dynamic";

/**
 * Cart checkout (US-MFTF-12.3). Requires authentication: the guest cart survives
 * sign-in via the US-MFTF-11.5 merge, so an unauthenticated buyer is sent to
 * sign-in with a return-to and lands back here with their cart intact. Collects
 * the shipping address before payment so per-provider shipping can be quoted into
 * the total (US-MFTF-12.4).
 */
export default async function CheckoutPage() {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) redirect(`/sign-in?callbackUrl=/checkout`);

  const cart = await resolveCartForRead();
  const view = cart ? await getCartView(cart.id) : { items: [], subtotal: 0, itemCount: 0 };
  if (view.items.length === 0) redirect("/cart");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-stone-900">Checkout</h1>
      <CheckoutClient view={view} />
    </main>
  );
}
