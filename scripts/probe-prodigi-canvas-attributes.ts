/**
 * One-off discovery: what per-item options does Prodigi expose for STRETCHED
 * CANVAS (GLOBAL-CAN-*)? We want the edge/wrap attribute key + its valid values
 * (mirror / image-wrap / black / white) and the accepted `sizing` values.
 *
 * Reads PRODIGI_API_KEY + PRODIGI_API_BASE_URL straight from .env.local (so it
 * uses whatever sandbox/prod base is configured). Read-only GETs plus, if asked,
 * a single sandbox quote to see how a wrap attribute is echoed/validated.
 *
 *   npx tsx scripts/probe-prodigi-canvas-attributes.ts
 */
import { readFileSync } from "node:fs";

function envFromLocal(key: string): string | undefined {
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  if (!line) return undefined;
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

const API_KEY = envFromLocal("PRODIGI_API_KEY");
const BASE = envFromLocal("PRODIGI_API_BASE_URL") ?? "https://api.prodigi.com/v4.0";
if (!API_KEY) {
  console.error("PRODIGI_API_KEY not found in .env.local");
  process.exit(1);
}
console.log(`Base URL: ${BASE}\n`);

const CANVAS_SKUS = ["GLOBAL-CAN-10X10", "GLOBAL-CAN-12X16", "GLOBAL-CAN-16X20"];

async function getProduct(sku: string) {
  const res = await fetch(`${BASE}/products/${sku}`, { headers: { "X-API-Key": API_KEY! } });
  console.log(`GET /products/${sku} → ${res.status}`);
  if (res.status !== 200) {
    console.log("  " + (await res.text()).slice(0, 400));
    return null;
  }
  const data = (await res.json()) as {
    product?: {
      sku: string;
      description?: string;
      attributes?: Record<string, string[]>;
      variants?: Array<{ attributes?: Record<string, string>; printAreaSizes?: unknown }>;
    };
  };
  const p = data.product;
  if (!p) return null;
  // Prodigi product-details may expose product-level `attributes` (the option
  // matrix: { wrap: [...], ... }) and/or per-variant attribute combinations.
  console.log("  product.attributes:", JSON.stringify(p.attributes ?? null));
  if (p.variants?.length) {
    const sample = p.variants.slice(0, 6).map((v) => v.attributes);
    console.log(`  variants: ${p.variants.length}; sample attributes:`, JSON.stringify(sample));
  }
  return p;
}

async function quoteWithWrap(sku: string, wrap: string) {
  // NB: `sizing` is an /orders field, not a /quotes field — quotes only take the
  // item attributes. Confirm `wrap` is accepted here.
  const body = {
    currencyCode: "USD",
    destinationCountryCode: "US",
    items: [{ sku, copies: 1, attributes: { wrap }, assets: [{ printArea: "default" }] }],
  };
  const res = await fetch(`${BASE}/quotes`, {
    method: "POST",
    headers: { "X-API-Key": API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log(`\nPOST /quotes ${sku} wrap=${wrap} → ${res.status}`);
  console.log("  " + (await res.text()).slice(0, 300));
}

async function orderWithWrap(sku: string, wrap: string, sizing: string) {
  const body = {
    shippingMethod: "Standard",
    recipient: {
      name: "Sandbox Tester",
      address: {
        line1: "1 Test St",
        townOrCity: "Testville",
        stateOrCounty: "CA",
        postalOrZipCode: "90210",
        countryCode: "US",
      },
    },
    items: [
      {
        sku,
        copies: 1,
        sizing,
        attributes: { wrap },
        assets: [{ printArea: "default", url: "https://pdf.prodigi.com/test/test-print.png" }],
      },
    ],
  };
  const res = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { "X-API-Key": API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log(`\nPOST /orders ${sku} wrap=${wrap} sizing=${sizing} → ${res.status}`);
  const json = (await res.json()) as {
    outcome?: string;
    order?: { id?: string; items?: Array<{ sku?: string; sizing?: string; attributes?: unknown }> };
    failures?: unknown;
  };
  console.log("  outcome:", json.outcome);
  if (json.order) {
    console.log("  order.id:", json.order.id);
    console.log("  echoed item:", JSON.stringify(json.order.items?.[0]));
  }
  if (json.failures) console.log("  failures:", JSON.stringify(json.failures).slice(0, 500));
}

async function main() {
  for (const sku of CANVAS_SKUS) {
    await getProduct(sku);
    await new Promise((r) => setTimeout(r, 400));
  }
  await quoteWithWrap("GLOBAL-CAN-12X16", "ImageWrap");
  await quoteWithWrap("GLOBAL-CAN-12X16", "NotARealWrap");
  // Place real sandbox orders to confirm wrap + sizing are accepted and echoed.
  await orderWithWrap("GLOBAL-CAN-12X16", "MirrorWrap", "fillPrintArea");
  await orderWithWrap("GLOBAL-CAN-12X16", "Black", "fitPrintArea");
  await orderWithWrap("GLOBAL-CAN-12X16", "NotARealWrap", "fillPrintArea");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
