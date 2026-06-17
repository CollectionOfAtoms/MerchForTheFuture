"use client";

import { useState } from "react";
import type { CartView } from "@/lib/cart/cart";
import type { CheckoutSummary } from "@/lib/checkout/types";
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";
import { createCheckoutAction } from "@/app/actions/checkout";

const usd = (n: number) => `$${n.toFixed(2)}`;

const FIELD =
  "w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

/**
 * Cart checkout client (US-MFTF-12.3). Collects the shipping address, calls
 * `createCheckoutAction` to re-validate the cart and quote per-provider shipping,
 * then renders the per-shipment summary. Buyers re-confirm when anything changed
 * before payment (US-MFTF-12.4). Provider names are never shown — only
 * "Shipment 1 / 2".
 */
export default function CheckoutClient({ view }: { view: CartView }) {
  const [address, setAddress] = useState<FulfillmentShippingAddress>({
    name: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal: "",
    country: "US",
  });
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  function set<K extends keyof FulfillmentShippingAddress>(key: K, value: string) {
    setAddress((a) => ({ ...a, [key]: value }));
    setSummary(null);
    setAcknowledged(false);
  }

  async function calculate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await createCheckoutAction(address);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSummary(result.summary);
  }

  const mustReconfirm = summary?.status === "changed" && !acknowledged;
  const canPay = summary != null && summary.groups.length > 0 && !mustReconfirm;

  return (
    <div className="mt-6 grid gap-8 md:grid-cols-[1fr_20rem]">
      <form onSubmit={calculate} className="space-y-3">
        <h2 className="text-lg font-medium text-stone-900">Shipping address</h2>
        <input className={FIELD} placeholder="Full name" value={address.name} onChange={(e) => set("name", e.target.value)} required />
        <input className={FIELD} placeholder="Address line 1" value={address.line1} onChange={(e) => set("line1", e.target.value)} required />
        <input className={FIELD} placeholder="Address line 2 (optional)" value={address.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input className={FIELD} placeholder="City" value={address.city} onChange={(e) => set("city", e.target.value)} required />
          <input className={FIELD} placeholder="State / region" value={address.state ?? ""} onChange={(e) => set("state", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className={FIELD} placeholder="Postal code" value={address.postal} onChange={(e) => set("postal", e.target.value)} required />
          <input className={FIELD} placeholder="Country (ISO)" value={address.country} onChange={(e) => set("country", e.target.value)} required maxLength={2} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          {pending ? "Calculating…" : "Calculate shipping"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <aside className="space-y-4 rounded-lg border border-stone-200 p-4">
        <h2 className="text-lg font-medium text-stone-900">Order summary</h2>

        {!summary && (
          <div className="space-y-1 text-sm text-stone-600">
            {view.items.map((i) => (
              <div key={i.id} className="flex justify-between">
                <span>{i.title} × {i.quantity}</span>
                <span>{usd(i.lineTotal)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-stone-200 pt-2 font-medium text-stone-900">
              <span>Subtotal</span>
              <span>{usd(view.subtotal)}</span>
            </div>
            <p className="pt-2 text-xs text-stone-500">Enter your address to calculate shipping and tax.</p>
          </div>
        )}

        {summary && (
          <div className="space-y-3 text-sm">
            {summary.removed.length > 0 && (
              <div className="rounded-md bg-amber-50 p-3 text-amber-800">
                <p className="font-medium">Some items changed:</p>
                <ul className="mt-1 list-disc pl-4">
                  {summary.removed.map((r, idx) => <li key={idx}>{r.reason}</li>)}
                </ul>
              </div>
            )}
            {summary.priceChanges.length > 0 && (
              <div className="rounded-md bg-amber-50 p-3 text-amber-800">
                <p className="font-medium">Prices updated:</p>
                <ul className="mt-1 list-disc pl-4">
                  {summary.priceChanges.map((p, idx) => (
                    <li key={idx}>{p.title}: {usd(p.from)} → {usd(p.to)}</li>
                  ))}
                </ul>
              </div>
            )}

            {summary.groups.map((g) => (
              <div key={g.label} className="border-t border-stone-200 pt-2">
                <p className="font-medium text-stone-900">{g.label}</p>
                {g.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-stone-600">
                    <span>{i.title} × {i.quantity}</span>
                    <span>{usd(i.lineTotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-stone-600">
                  <span>Shipping</span>
                  <span>{usd(g.shippingCost)}</span>
                </div>
              </div>
            ))}

            <div className="space-y-1 border-t border-stone-200 pt-2">
              <div className="flex justify-between text-stone-600"><span>Items</span><span>{usd(summary.itemsSubtotal)}</span></div>
              <div className="flex justify-between text-stone-600"><span>Shipping</span><span>{usd(summary.shippingTotal)}</span></div>
              <div className="flex justify-between font-medium text-stone-900"><span>Total before tax</span><span>{usd(summary.total)}</span></div>
              <p className="text-xs text-stone-500">Tax is calculated at payment.</p>
            </div>

            {mustReconfirm && (
              <label className="flex items-start gap-2 text-stone-700">
                <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1" />
                <span>I&apos;ve reviewed the changes above and want to continue.</span>
              </label>
            )}

            <button
              type="button"
              disabled={!canPay}
              className="w-full rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
            >
              Proceed to payment
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
