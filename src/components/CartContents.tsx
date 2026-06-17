"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CartView } from "@/lib/cart/cart";
import { updateCartItemAction, removeCartItemAction } from "@/app/actions/cart";

function usd(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Interactive cart contents (US-MFTF-11.4): quantity steppers (min 1), remove
 * controls, and a subtotal. Mutations go through the ownership-guarded server
 * actions; after each one the server nav + page are refreshed so the badge and
 * totals stay in sync without a full reload.
 */
export default function CartContents({ view }: { view: CartView }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function mutate(id: string, fn: () => Promise<{ error: string } | { success: true; count: number }>) {
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if ("error" in result) setError(result.error);
      else router.refresh();
      setPendingId(null);
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
        {view.items.map((item) => {
          const busy = isPending && pendingId === item.id;
          return (
            <li key={item.id} className="flex items-center gap-4 p-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                {item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-stone-500">
                    {item.kind === "APPAREL" ? "Apparel" : "Print"}
                  </span>
                  <p className="truncate text-sm font-medium text-stone-900">{item.title}</p>
                </div>
                {item.selectionSummary && (
                  <p className="mt-0.5 text-xs text-stone-500">{item.selectionSummary}</p>
                )}
                <p className="mt-1 text-xs text-stone-500">{usd(item.unitPrice)} each</p>
              </div>

              <div className="flex items-center gap-1" aria-label="Quantity">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={busy || item.quantity <= 1}
                  onClick={() => mutate(item.id, () => updateCartItemAction(item.id, item.quantity - 1))}
                  className="h-7 w-7 rounded-full border border-stone-300 text-stone-700 disabled:opacity-40"
                >
                  −
                </button>
                <span data-testid="line-qty" className="w-8 text-center text-sm">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  disabled={busy}
                  onClick={() => mutate(item.id, () => updateCartItemAction(item.id, item.quantity + 1))}
                  className="h-7 w-7 rounded-full border border-stone-300 text-stone-700 disabled:opacity-40"
                >
                  +
                </button>
              </div>

              <div className="w-20 text-right text-sm font-semibold text-stone-900">{usd(item.lineTotal)}</div>

              <button
                type="button"
                aria-label="Remove item"
                disabled={busy}
                onClick={() => mutate(item.id, () => removeCartItemAction(item.id))}
                className="text-stone-400 transition-colors hover:text-rose-600 disabled:opacity-40"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      <div className="flex flex-col items-end gap-2">
        <div className="flex w-full max-w-xs items-center justify-between text-sm">
          <span className="text-stone-600">Subtotal</span>
          <span className="text-lg font-semibold text-stone-900">{usd(view.subtotal)}</span>
        </div>
        <p className="text-xs text-stone-400">Shipping and tax are calculated at checkout.</p>
        <Link
          href="/checkout"
          className="mt-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-700"
        >
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
