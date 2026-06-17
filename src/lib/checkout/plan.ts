/**
 * Internal checkout plan (US-MFTF-12.3/12.4): revalidate the cart, group kept
 * items by resolved provider key, and quote each group's shipping in parallel
 * (10s budget) converted to USD. This carries the provider key + quote items —
 * the buyer-facing summary (`summary.ts`) strips those; the session builder
 * (`session.ts`) uses them to create FulfillmentOrder + OrderItem rows.
 */
import { getProviderByKey } from "@/lib/fulfillment";
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";
import { getExchangeRate } from "@/lib/tax/currency";
import { revalidateCheckout } from "./revalidate";
import type { KeptItem, RemovedItem, PriceChange } from "./types";

/** Vercel serverless functions cap at 10s; the quote phase must finish within it. */
const QUOTE_TIMEOUT_MS = 10_000;

export interface PlanGroup {
  /** Internal provider registry key — never exposed to the buyer. */
  providerKey: string;
  shippingMethod: string;
  /** Shipping cost in USD (provider currency already converted). */
  shippingCost: number;
  items: KeptItem[];
}

export interface CheckoutPlan {
  status: "ok" | "changed";
  removed: RemovedItem[];
  priceChanges: PriceChange[];
  groups: PlanGroup[];
  itemsSubtotal: number;
  shippingTotal: number;
  total: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function planCheckout(
  cartId: string,
  address: FulfillmentShippingAddress,
): Promise<CheckoutPlan> {
  const { kept, removed, priceChanges } = await revalidateCheckout(cartId);

  const byProvider = new Map<string, KeptItem[]>();
  for (const item of kept) {
    const list = byProvider.get(item.providerKey) ?? [];
    list.push(item);
    byProvider.set(item.providerKey, list);
  }
  const providerKeys = [...byProvider.keys()].sort();

  const groups = await withTimeout(
    Promise.all(
      providerKeys.map(async (key): Promise<PlanGroup> => {
        const items = byProvider.get(key)!;
        const provider = getProviderByKey(key);
        const quote = await provider.quoteShipping(
          items.map((i) => i.quoteItem),
          address,
        );
        // Single FX point — shipping only (the item base is never FX-converted).
        // // UNVERIFIED rate until a live Teemill proofing order confirms amounts.
        const rate = quote.currency === "USD" ? 1 : await getExchangeRate(quote.currency, "USD");
        return { providerKey: key, shippingMethod: quote.shippingMethod, shippingCost: round2(quote.shippingCost * rate), items };
      }),
    ),
    QUOTE_TIMEOUT_MS,
    "Shipping quote",
  );

  const itemsSubtotal = round2(kept.reduce((sum, i) => sum + i.lineTotal, 0));
  const shippingTotal = round2(groups.reduce((sum, g) => sum + g.shippingCost, 0));
  const total = round2(itemsSubtotal + shippingTotal);

  return {
    status: removed.length > 0 || priceChanges.length > 0 ? "changed" : "ok",
    removed,
    priceChanges,
    groups,
    itemsSubtotal,
    shippingTotal,
    total,
  };
}
