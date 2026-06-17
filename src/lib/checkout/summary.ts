/**
 * Build the checkout summary (US-MFTF-12.3): revalidate the cart, group kept items
 * by resolved provider key, quote each group's shipping in parallel (10s budget),
 * convert provider-currency shipping to USD, and return a buyer-facing summary
 * that never exposes provider names ("Shipment 1", "Shipment 2").
 */
import { getProviderByKey } from "@/lib/fulfillment";
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";
import { getExchangeRate } from "@/lib/tax/currency";
import { revalidateCheckout } from "./revalidate";
import type { CheckoutSummary, KeptItem, SummaryGroup } from "./types";

/** Vercel serverless functions cap at 10s; quote phase must finish within it. */
const QUOTE_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function buildCheckoutSummary(
  cartId: string,
  address: FulfillmentShippingAddress,
): Promise<CheckoutSummary> {
  const { kept, removed, priceChanges } = await revalidateCheckout(cartId);

  // Group kept items by resolved provider key (stable order by key).
  const byProvider = new Map<string, KeptItem[]>();
  for (const item of kept) {
    const list = byProvider.get(item.providerKey) ?? [];
    list.push(item);
    byProvider.set(item.providerKey, list);
  }
  const providerKeys = [...byProvider.keys()].sort();

  // Quote every group's shipping in parallel within the function budget.
  const quoted = await withTimeout(
    Promise.all(
      providerKeys.map(async (key) => {
        const groupItems = byProvider.get(key)!;
        const provider = getProviderByKey(key);
        const quote = await provider.quoteShipping(
          groupItems.map((i) => i.quoteItem),
          address,
        );
        // Convert provider-currency shipping to USD — the single FX point, for
        // shipping only (the item base is never FX-converted). // UNVERIFIED rate
        // until a live proofing order confirms Teemill's GBP shipping amounts.
        const rate = quote.currency === "USD" ? 1 : await getExchangeRate(quote.currency, "USD");
        return { key, groupItems, shippingMethod: quote.shippingMethod, shippingCostUsd: round2(quote.shippingCost * rate) };
      }),
    ),
    QUOTE_TIMEOUT_MS,
    "Shipping quote",
  );

  const groups: SummaryGroup[] = quoted.map((g, index) => ({
    label: `Shipment ${index + 1}`,
    items: g.groupItems.map((i) => ({
      title: i.title,
      selectionSummary: i.selectionSummary,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    shippingMethod: g.shippingMethod,
    shippingCost: g.shippingCostUsd,
  }));

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
