/**
 * Live-verify the Printful v2 discovery spike (US-MFTF-18.1).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probe-printful-catalog.ts
 *
 * READ-ONLY: hits catalog + a single shipping-rates quote. It creates NO order
 * (not even a draft) and configures no webhook — safe to run against a live key.
 * Resolves the UNVERIFIED items in docs/printful-api-notes.md that don't need a
 * placed order: #1 (store-id header), #3 (fabric-composition field path),
 * variant/colour/size field paths, #5 (shipping endpoint), #8 (currency param),
 * plus confirms the rate-limit header names. Items #2/#4/#6/#7 (webhook sig,
 * PRINTING status, calc timing, tracking) need an order/webhook and are probed
 * separately once the store is confirmed a TEST store.
 */

const API_KEY = process.env.PRINTFUL_API_KEY;
const STORE_ID = process.env.PRINTFUL_STORE_ID; // optional (UNVERIFIED #1)
const BASE = (process.env.PRINTFUL_API_BASE_URL || "https://api.printful.com/v2").replace(/\/$/, "");

if (!API_KEY) {
  console.error("Set PRINTFUL_API_KEY in .env.local before running this script.");
  process.exit(1);
}

const RATELIMIT_HEADERS = ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "x-ratelimit-policy"];

interface PfResult {
  status: number;
  ratelimit: Record<string, string | null>;
  body: unknown;
}

async function pf(path: string, init: RequestInit = {}, withStoreId = false): Promise<PfResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (withStoreId && STORE_ID) headers["X-PF-Store-Id"] = STORE_ID;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const ratelimit: Record<string, string | null> = {};
  for (const h of RATELIMIT_HEADERS) ratelimit[h] = res.headers.get(h);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, ratelimit, body };
}

/** Walk an object and return dotted paths whose key OR string value looks like a fabric composition. */
function findCompositionPaths(obj: unknown, prefix = ""): string[] {
  const hits: string[] = [];
  const compKey = /(material|composition|fabric)/i;
  const compVal = /\b\d{1,3}\s*%/; // "52%" etc.
  const visit = (v: unknown, path: string) => {
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        if (compKey.test(k)) hits.push(`${p} (key match) = ${JSON.stringify(val).slice(0, 120)}`);
        else if (typeof val === "string" && compVal.test(val) && /cotton|poly|wool|linen|hemp|viscose|elastane|spandex|modal|bamboo/i.test(val))
          hits.push(`${p} (value looks like composition) = ${JSON.stringify(val).slice(0, 120)}`);
        visit(val, p);
      }
    }
  };
  visit(obj, prefix);
  return hits;
}

function line() {
  console.log("─".repeat(74));
}

async function main() {
  console.log(`Printful v2 probe — base ${BASE}`);
  console.log(`Store id present: ${STORE_ID ? "yes" : "no"}\n`);

  // ── UNVERIFIED #1 — does the account token need X-PF-Store-Id? ───────────────
  line();
  console.log("[#1] Auth — GET /catalog-products?limit=1 with Bearer ONLY (no store id)");
  const noStore = await pf("/catalog-products?limit=1");
  console.log(`  → HTTP ${noStore.status}`);
  console.log(`  → rate-limit headers: ${JSON.stringify(noStore.ratelimit)}`);
  if (noStore.status === 200) {
    console.log("  ✓ Bearer alone works — X-PF-Store-Id NOT required for catalog reads.");
  } else {
    console.log(`  ✗ Bearer alone failed. Body: ${JSON.stringify(noStore.body).slice(0, 300)}`);
    if (STORE_ID) {
      const withStore = await pf("/catalog-products?limit=1", {}, true);
      console.log(`  Retry WITH X-PF-Store-Id → HTTP ${withStore.status}`);
      if (withStore.status === 200) console.log("  ✓ Store id header IS required. Keep PRINTFUL_STORE_ID set.");
    } else {
      console.log("  → No PRINTFUL_STORE_ID set to retry with. If this is an account token, add one.");
    }
  }

  // Use whichever auth worked for the rest.
  const useStore = noStore.status !== 200 && !!STORE_ID;

  // ── Catalog listing → pick a product to inspect ─────────────────────────────
  line();
  console.log("[catalog] GET /catalog-products?limit=3 (first page shape)");
  const list = await pf("/catalog-products?limit=3", {}, useStore);
  const products = (list.body as { data?: Array<{ id: number; name?: string; type?: string }> })?.data ?? [];
  console.log(`  → HTTP ${list.status}, ${products.length} products; ids: ${products.map((p) => p.id).join(", ")}`);
  const pagingKeys = Object.keys((list.body as Record<string, unknown>) ?? {});
  console.log(`  → top-level response keys: ${pagingKeys.join(", ")}`);

  const productId = products[0]?.id;
  if (!productId) {
    console.log("\n  No product id returned — cannot probe detail/variants. Stopping.");
    return;
  }

  // ── UNVERIFIED #3 — fabric composition field path ───────────────────────────
  line();
  console.log(`[#3] GET /catalog-products/${productId} (fabric/material field path)`);
  const detail = await pf(`/catalog-products/${productId}`, {}, useStore);
  const detailData = (detail.body as { data?: unknown })?.data ?? detail.body;
  console.log(`  → HTTP ${detail.status}; top-level data keys: ${Object.keys((detailData as Record<string, unknown>) ?? {}).join(", ")}`);
  const compHits = findCompositionPaths(detailData);
  if (compHits.length) {
    console.log("  ✓ Candidate composition field(s):");
    compHits.forEach((h) => console.log(`      ${h}`));
  } else {
    console.log("  ✗ No composition-looking field found on this product — inspect full JSON below.");
    console.log(`      ${JSON.stringify(detailData).slice(0, 500)}`);
  }

  // ── Variant field paths (id used in orders, colour, size) ───────────────────
  line();
  console.log(`[variants] GET /catalog-products/${productId}/catalog-variants?limit=2`);
  const variants = await pf(`/catalog-products/${productId}/catalog-variants?limit=2`, {}, useStore);
  const vData = (variants.body as { data?: Array<Record<string, unknown>> })?.data ?? [];
  console.log(`  → HTTP ${variants.status}; ${vData.length} variants`);
  if (vData[0]) {
    console.log(`  → variant[0] keys: ${Object.keys(vData[0]).join(", ")}`);
    console.log(`  → variant[0] sample: ${JSON.stringify(vData[0]).slice(0, 400)}`);
  }
  const variantId = vData[0]?.id as number | undefined;

  // ── UNVERIFIED #8 + #5 — currency param + shipping endpoint ──────────────────
  if (variantId) {
    line();
    console.log(`[#5/#8] POST /shipping-rates (currency=USD, variant ${variantId}) — creates NO order`);
    const rates = await pf("/shipping-rates", {
      method: "POST",
      body: JSON.stringify({
        recipient: { country_code: "US", state_code: "CA", city: "Los Angeles", zip: "90001" },
        order_items: [{ catalog_variant_id: variantId, quantity: 1 }],
        currency: "USD",
      }),
    }, useStore);
    console.log(`  → HTTP ${rates.status}`);
    console.log(`  → body (first 500): ${JSON.stringify(rates.body).slice(0, 500)}`);
    if (rates.status >= 400) {
      console.log("  → non-2xx: inspect body for the correct currency param name/placement (#8) or required fields.");
    }
  } else {
    console.log("\n[#5/#8] Skipped shipping-rates — no variant id resolved.");
  }

  line();
  console.log("\nDone. Map the above back into docs/printful-api-notes.md (items #1, #3, #5, #8,");
  console.log("rate-limit headers). Items #2/#4/#6/#7 need an order/webhook against a TEST store —");
  console.log("run those only after confirming the store is a test store.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
