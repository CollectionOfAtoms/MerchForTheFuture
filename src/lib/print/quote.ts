/**
 * Live Prodigi unit-price quote for a print SKU (US-MFTF-11.3).
 *
 * Used to snapshot a *display-only* `quotedUnitPrice` onto a PRINT cart line at
 * add time. It is intentionally not the authoritative price: checkout (MFTF-12)
 * re-quotes from Prodigi and the current quote always wins. In tests the call is
 * intercepted by MSW (no live API).
 */

interface ProdigiQuoteResponse {
  quotes?: {
    costSummary?: {
      items?: { amount?: string | number; currency?: string };
    };
  }[];
}

function base(): string {
  return process.env.PRODIGI_API_BASE_URL ?? "https://api.prodigi.com/v4.0";
}

function apiKey(): string {
  return process.env.PRODIGI_API_KEY ?? "test_key";
}

export interface PrintQuoteInput {
  sku: string;
  attributes?: Record<string, string>;
  copies?: number;
}

/**
 * Returns the quoted unit price (USD) for one copy of `sku`. Throws on a failed
 * request or a response that carries no item cost — callers surface a friendly
 * "couldn't price this print" error.
 */
export async function quotePrintUnitPrice(input: PrintQuoteInput): Promise<number> {
  const copies = input.copies ?? 1;
  const resp = await fetch(`${base()}/quotes`, {
    method: "POST",
    headers: { "X-API-Key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      shippingMethod: "Budget",
      destinationCountryCode: "US",
      currencyCode: "USD",
      items: [
        {
          sku: input.sku,
          copies,
          attributes: input.attributes ?? {},
          assets: [{ printArea: "default" }],
        },
      ],
    }),
  });

  if (!resp.ok) throw new Error(`Prodigi quote failed: ${resp.status}`);
  const data = (await resp.json()) as ProdigiQuoteResponse;
  const amount = Number(data?.quotes?.[0]?.costSummary?.items?.amount);
  if (!Number.isFinite(amount)) throw new Error("Prodigi quote returned no item cost.");
  // `amount` is the cost for all `copies`; normalize to a per-unit price.
  return Math.round((amount / copies) * 100) / 100;
}
