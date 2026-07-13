/**
 * Live-verify the Printify API discovery spike (US-MFTF-17.1).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probe-printify-catalog.ts
 *
 * SAFETY: Printify has NO sandbox. This script is strictly READ-ONLY plus one
 * shipping-COST CALCULATION (POST /orders/shipping.json, which returns a quote
 * and creates NO order). It never creates a product, never creates an order,
 * never calls send_to_production, and never publishes anything. Nothing is
 * fulfilled or charged.
 *
 * Resolves the US-MFTF-17.1 checklist items that are safe to verify live:
 * auth/shop scoping, catalog (blueprint/provider/variant) shape, colour/size/
 * stock semantics, currency, shipping-quote shape, webhook config, and whether
 * fabric composition is exposed (material-standard gate). Order-submission and
 * live status/webhook payloads are documented from the API docs and left
 * UNVERIFIED — they need a real order (US-MFTF-17.3), deliberately not done here.
 */

const API_KEY = process.env.PRINTIFY_API_KEY;
const BASE = "https://api.printify.com/v1";
const UA = "MerchForTheFuture/1.0 (+discovery-spike US-MFTF-17.1)";

if (!API_KEY) {
  console.error("Set PRINTIFY_API_KEY in .env.local before running this script.");
  process.exit(1);
}

interface PfResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

async function pf(path: string, init: RequestInit = {}): Promise<PfResult> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "User-Agent": UA,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, headers, body };
}

const COMP_KEY = /(material|composition|fabric)/i;
const COMP_VAL = /\b\d{1,3}\s*%[^<]*?(cotton|poly|wool|linen|hemp|viscose|elastane|spandex|modal|bamboo|acrylic)/i;

/** Scan an object tree for fabric-composition-looking fields (key or value). */
function findComposition(obj: unknown): string[] {
  const hits: string[] = [];
  const visit = (v: unknown, path: string) => {
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        if (COMP_KEY.test(k)) hits.push(`${p} (KEY match) = ${JSON.stringify(val).slice(0, 140)}`);
        else if (typeof val === "string" && COMP_VAL.test(val)) hits.push(`${p} (value looks like composition) = ${val.replace(/<[^>]+>/g, " ").slice(0, 140)}`);
        visit(val, p);
      }
    }
  };
  visit(obj, "");
  return hits;
}

function line() {
  console.log("─".repeat(76));
}

async function main() {
  console.log(`Printify v1 probe — base ${BASE}  (READ-ONLY + shipping calc only)\n`);

  // ── Auth + shop scoping ─────────────────────────────────────────────────────
  line();
  console.log("[auth] GET /shops.json");
  const shops = await pf("/shops.json");
  console.log(`  → HTTP ${shops.status}`);
  const rlKeys = Object.keys(shops.headers).filter((h) => /ratelimit|retry-after/i.test(h));
  console.log(`  → rate-limit-ish headers: ${rlKeys.length ? rlKeys.map((k) => `${k}=${shops.headers[k]}`).join(", ") : "(none seen — Printify uses 429 + Retry-After)"}`);
  if (shops.status !== 200) {
    console.log(`  ✗ Auth failed. Body: ${JSON.stringify(shops.body).slice(0, 300)}`);
    return;
  }
  const shopList = shops.body as Array<{ id: number; title: string; sales_channel?: string }>;
  console.log(`  ✓ ${shopList.length} shop(s): ${shopList.map((s) => `${s.id}:${s.title} (${s.sales_channel ?? "?"})`).join(" | ")}`);
  const shopId = shopList[0]?.id;
  if (!shopId) {
    console.log("  ✗ No shop id — a Printify shop/sales-channel must exist to scope orders. Stopping.");
    return;
  }

  // ── Catalog: blueprints (product types / blanks) ────────────────────────────
  line();
  console.log("[catalog] GET /catalog/blueprints.json");
  const blueprints = await pf("/catalog/blueprints.json");
  const bpList = (blueprints.body as Array<{ id: number; title: string; brand?: string; model?: string }>) ?? [];
  console.log(`  → HTTP ${blueprints.status}; ${bpList.length} blueprints`);
  if (bpList[0]) console.log(`  → blueprint[0] keys: ${Object.keys(bpList[0]).join(", ")}`);
  console.log(`  → first 5: ${bpList.slice(0, 5).map((b) => `${b.id}:${b.title}`).join(" | ")}`);

  const bp = bpList[0];
  if (!bp) {
    console.log("  ✗ No blueprints returned. Stopping.");
    return;
  }

  // ── Blueprint detail — fabric/material field path (material-standard gate) ───
  line();
  console.log(`[material] GET /catalog/blueprints/${bp.id}.json  (id ${bp.id}: ${bp.title})`);
  const bpDetail = await pf(`/catalog/blueprints/${bp.id}.json`);
  const bpData = bpDetail.body as Record<string, unknown>;
  console.log(`  → HTTP ${bpDetail.status}; keys: ${Object.keys(bpData ?? {}).join(", ")}`);
  const comp = findComposition(bpData);
  if (comp.length) {
    console.log("  ✓ Composition-looking field(s):");
    comp.forEach((h) => console.log(`      ${h}`));
  } else {
    console.log("  ✗ No structured/textual composition found on the blueprint object.");
    if (typeof bpData?.description === "string") console.log(`      description (stripped, 200ch): ${(bpData.description as string).replace(/<[^>]+>/g, " ").slice(0, 200)}`);
  }

  // ── Print providers for this blueprint ──────────────────────────────────────
  line();
  console.log(`[providers] GET /catalog/blueprints/${bp.id}/print_providers.json`);
  const providers = await pf(`/catalog/blueprints/${bp.id}/print_providers.json`);
  const provList = (providers.body as Array<{ id: number; title: string }>) ?? [];
  console.log(`  → HTTP ${providers.status}; ${provList.length} providers: ${provList.slice(0, 5).map((p) => `${p.id}:${p.title}`).join(" | ")}`);
  const providerId = provList[0]?.id;
  if (!providerId) {
    console.log("  ✗ No print provider — cannot probe variants/shipping. Stopping.");
    return;
  }

  // ── Variants — orderable id, colour/size options, stock semantics ───────────
  line();
  console.log(`[variants] GET /catalog/blueprints/${bp.id}/print_providers/${providerId}/variants.json`);
  const variants = await pf(`/catalog/blueprints/${bp.id}/print_providers/${providerId}/variants.json`);
  const vBody = variants.body as { variants?: Array<Record<string, unknown>> };
  const vList = vBody?.variants ?? [];
  console.log(`  → HTTP ${variants.status}; ${vList.length} variants`);
  if (vList[0]) {
    console.log(`  → variant[0] keys: ${Object.keys(vList[0]).join(", ")}`);
    console.log(`  → variant[0]: ${JSON.stringify(vList[0]).slice(0, 300)}`);
    console.log(`  → NOTE stock semantics: check for an availability/stock/placeholder field above (BUG-13 lesson — POD vs warehouse).`);
  }
  const variantId = vList[0]?.id as number | undefined;

  // ── Shipping profile (currency + cost shape) ────────────────────────────────
  line();
  console.log(`[shipping-profile] GET /catalog/blueprints/${bp.id}/print_providers/${providerId}/shipping.json`);
  const shipProfile = await pf(`/catalog/blueprints/${bp.id}/print_providers/${providerId}/shipping.json`);
  console.log(`  → HTTP ${shipProfile.status}; keys: ${Object.keys((shipProfile.body as Record<string, unknown>) ?? {}).join(", ")}`);
  console.log(`  → sample: ${JSON.stringify(shipProfile.body).slice(0, 300)}`);

  // ── Webhooks (read-only list) ───────────────────────────────────────────────
  line();
  console.log(`[webhooks] GET /shops/${shopId}/webhooks.json  (read-only)`);
  const webhooks = await pf(`/shops/${shopId}/webhooks.json`);
  console.log(`  → HTTP ${webhooks.status}; existing: ${JSON.stringify(webhooks.body).slice(0, 200)}`);

  // ── Existing products (read-only) — confirms the DESIGNED product shape ──────
  line();
  console.log(`[products] GET /shops/${shopId}/products.json?limit=1  (read-only, confirms product-creation model)`);
  const products = await pf(`/shops/${shopId}/products.json?limit=1`);
  const pBody = products.body as { data?: Array<Record<string, unknown>> };
  console.log(`  → HTTP ${products.status}; ${pBody?.data?.length ?? 0} existing products`);
  if (pBody?.data?.[0]) console.log(`  → product[0] keys (note print_areas/images = DESIGNED upload model): ${Object.keys(pBody.data[0]).join(", ")}`);

  // ── Shipping COST CALCULATION — creates NO order ────────────────────────────
  if (variantId) {
    line();
    console.log(`[shipping-calc] POST /shops/${shopId}/orders/shipping.json — CALCULATION ONLY, no order created`);
    const calc = await pf(`/shops/${shopId}/orders/shipping.json`, {
      method: "POST",
      body: JSON.stringify({
        line_items: [{ print_provider_id: providerId, blueprint_id: bp.id, variant_id: variantId, quantity: 1 }],
        address_to: {
          first_name: "Test", last_name: "Recipient", email: "noreply@merchforthefuture.com",
          country: "US", region: "CA", city: "Los Angeles", address1: "1 Main St", zip: "90001",
        },
      }),
    });
    console.log(`  → HTTP ${calc.status}`);
    console.log(`  → body: ${JSON.stringify(calc.body).slice(0, 300)}  (currency? unit = cents?)`);
  }

  line();
  console.log("\nDone (read-only). Fold findings into docs/printify-api-notes.md. Order submission,");
  console.log("live status transitions, and webhook payloads remain UNVERIFIED by design — they need");
  console.log("a real order and belong to US-MFTF-17.3 (founder live confirmation), NOT this spike.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
