import type { Metadata } from "next";
import { resolveCartForRead } from "@/lib/cart/request";
import { getCartView } from "@/lib/cart/cart";
import CartContents from "@/components/CartContents";
import CartEmpty from "@/components/CartEmpty";

export const metadata: Metadata = {
  title: "Your cart — Merch for the Future",
};

// The cart is per-visitor (guest cookie or user), so it must never be cached.
export const dynamic = "force-dynamic";

/**
 * Cart page (US-MFTF-11.4). Server-rendered from the visitor's cart (guest cookie
 * or authenticated user). Renders the empty state or the interactive contents.
 */
export default async function CartPage() {
  const cart = await resolveCartForRead();
  const view = cart ? await getCartView(cart.id) : { items: [], subtotal: 0, itemCount: 0 };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-stone-900">Your cart</h1>

      {view.items.length === 0 ? <CartEmpty /> : <CartContents view={view} />}
    </main>
  );
}
