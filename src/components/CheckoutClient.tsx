"use client";

import { useState } from "react";
import type { CartView } from "@/lib/cart/cart";
import type { CheckoutSummary } from "@/lib/checkout/types";
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";
import { createCheckoutAction } from "@/app/actions/checkout";
import CartPaymentForm from "@/components/CartPaymentForm";
import { convertWithRate, formatCurrency, type DisplayCurrency } from "@/lib/tax/currency";

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
export default function CheckoutClient({
  view,
  initialAddress,
  display,
}: {
  view: CartView;
  /** The buyer's primary saved address, pre-filled into the form when present. */
  initialAddress?: FulfillmentShippingAddress | null;
  /** Buyer's display currency + USD→currency rate (US-5.4). Display only — Stripe charges USD. */
  display?: DisplayCurrency | null;
}) {
  const [address, setAddress] = useState<FulfillmentShippingAddress>(
    initialAddress ?? {
      name: "",
      line1: "",
      line2: "",
      city: "",
      state: "",
      postal: "",
      country: "US",
    },
  );
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  // Buyer's per-shipment shipping-method choice, keyed by group index ("0", "1", …).
  const [selections, setSelections] = useState<Record<string, string>>({});

  function set<K extends keyof FulfillmentShippingAddress>(key: K, value: string) {
    setAddress((a) => ({ ...a, [key]: value }));
    setSummary(null);
    setAcknowledged(false);
    setShowPayment(false);
    setSelections({});
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
    // Pre-select each shipment's default (cheapest) method.
    const defaults: Record<string, string> = {};
    result.summary.groups.forEach((g, i) => { defaults[String(i)] = g.shippingMethod; });
    setSelections(defaults);
  }

  function chooseMethod(groupIndex: number, method: string) {
    setSelections((s) => ({ ...s, [String(groupIndex)]: method }));
    setShowPayment(false); // re-open payment with the new selection
  }

  function selectedFor(group: CheckoutSummary["groups"][number], index: number) {
    const method = selections[String(index)] ?? group.shippingMethod;
    return group.options.find((o) => o.method === method) ?? { method, cost: group.shippingCost };
  }

  const computedShipping = summary
    ? summary.groups.reduce((sum, g, i) => sum + selectedFor(g, i).cost, 0)
    : 0;
  const computedTotal = (summary?.itemsSubtotal ?? 0) + computedShipping;

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

            {summary.groups.map((g, gi) => {
              const selected = selectedFor(g, gi);
              return (
                <div key={g.label} className="border-t border-stone-200 pt-2">
                  <p className="font-medium text-stone-900">{g.label}</p>
                  {g.items.map((i, idx) => (
                    <div key={idx} className="flex justify-between text-stone-600">
                      <span>{i.title} × {i.quantity}</span>
                      <span>{usd(i.lineTotal)}</span>
                    </div>
                  ))}
                  <div className="mt-1">
                    <p className="text-xs font-medium text-stone-500">Shipping method</p>
                    {g.options.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {g.options.map((o) => (
                          <label key={o.method} className="flex items-center justify-between gap-2 text-stone-700">
                            <span className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`ship-${gi}`}
                                checked={selected.method === o.method}
                                onChange={() => chooseMethod(gi, o.method)}
                              />
                              <span>{o.method}</span>
                            </span>
                            <span>{o.cost === 0 ? "Free" : usd(o.cost)}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="flex justify-between text-stone-600">
                        <span>Shipping</span>
                        <span>{selected.cost === 0 ? "Free" : usd(selected.cost)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="space-y-1 border-t border-stone-200 pt-2">
              <div className="flex justify-between text-stone-600"><span>Items</span><span>{usd(summary.itemsSubtotal)}</span></div>
              <div className="flex justify-between text-stone-600"><span>Shipping</span><span>{usd(computedShipping)}</span></div>
              <div className="flex justify-between font-medium text-stone-900"><span>Total before tax</span><span>{usd(computedTotal)}</span></div>
              {display && display.currency !== "USD" && display.rate != null && (
                <div className="flex justify-between text-xs text-stone-500">
                  <span>Approx. in {display.currency}</span>
                  <span>≈ {formatCurrency(convertWithRate(computedTotal, display.rate), display.currency)}</span>
                </div>
              )}
              <p className="text-xs text-stone-500">
                Tax is calculated at payment.
                {display && display.currency !== "USD" && display.rate != null
                  ? " Your card is charged in USD."
                  : ""}
              </p>
            </div>

            {mustReconfirm && (
              <label className="flex items-start gap-2 text-stone-700">
                <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1" />
                <span>I&apos;ve reviewed the changes above and want to continue.</span>
              </label>
            )}

            {!showPayment && (
              <button
                type="button"
                disabled={!canPay}
                onClick={() => setShowPayment(true)}
                className="w-full rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
              >
                Proceed to payment
              </button>
            )}
          </div>
        )}
      </aside>

      {showPayment && canPay && (
        <div className="md:col-span-2">
          <CartPaymentForm address={address} selections={selections} />
        </div>
      )}
    </div>
  );
}
