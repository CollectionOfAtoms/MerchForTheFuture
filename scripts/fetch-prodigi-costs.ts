/**
 * Fetch Prodigi unit costs for all catalog SKUs and write to src/lib/print/costs.json.
 *
 * Usage:
 *   PRODIGI_API_KEY=your_key npx tsx scripts/fetch-prodigi-costs.ts
 *
 * Commit the updated costs.json so the seller edit form shows ~$X estimates
 * without making a live API call on every page load. Re-run whenever Prodigi
 * updates their pricing.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { getPrintCatalog } from "../src/lib/print/listing";

const API_KEY = process.env.PRODIGI_API_KEY;
if (!API_KEY) {
  console.error("Set PRODIGI_API_KEY before running this script.");
  process.exit(1);
}

const catalog = getPrintCatalog();

const BATCH_SIZE = 20;

type QuoteResponse = {
  outcome: string;
  quotes: Array<{
    items: Array<{ sku: string; unitCost: { amount: string; currency: string } }>;
  }>;
};

async function quoteBatch(skus: typeof catalog): Promise<Record<string, number>> {
  const res = await fetch("https://api.prodigi.com/v4.0/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY! },
    body: JSON.stringify({
      destinationCountryCode: "US",
      currencyCode: "USD",
      shippingMethod: "standard",
      items: skus.map((p) => ({
        sku: p.sku,
        copies: 1,
        assets: [{ printArea: "default" }],
        ...(p.sku.startsWith("GLOBAL-CAN-") && { attributes: { wrap: "White" } }),
      })),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Prodigi API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as QuoteResponse;
  const quote = data.quotes?.[0];
  if (!quote) throw new Error(`No quotes in response: ${JSON.stringify(data)}`);

  const costs: Record<string, number> = {};
  for (const item of quote.items) {
    const amount = parseFloat(item.unitCost.amount);
    if (isFinite(amount)) costs[item.sku] = amount;
  }
  return costs;
}

async function main() {
  console.log(`Fetching quotes for ${catalog.length} SKUs in batches of ${BATCH_SIZE}…`);

  const costs: Record<string, number> = {};
  for (let i = 0; i < catalog.length; i += BATCH_SIZE) {
    const batch = catalog.slice(i, i + BATCH_SIZE);
    process.stdout.write(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(catalog.length / BATCH_SIZE)} (${batch[0].sku} … ${batch[batch.length - 1].sku}) … `);
    const batchCosts = await quoteBatch(batch);
    Object.assign(costs, batchCosts);
    console.log(`got ${Object.keys(batchCosts).length} prices`);
  }

  for (const [sku, cost] of Object.entries(costs)) {
    console.log(`  ${sku.padEnd(22)} $${cost.toFixed(2)}`);
  }

  const missing = catalog.filter((p) => costs[p.sku] == null).map((p) => p.sku);
  if (missing.length > 0) {
    console.warn(`\nNo cost returned for ${missing.length} SKUs:`, missing.join(", "));
  }

  const outPath = join(process.cwd(), "src/lib/print/costs.json");
  writeFileSync(outPath, JSON.stringify(costs, null, 2) + "\n");
  console.log(`\nWrote ${Object.keys(costs).length} costs to src/lib/print/costs.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
