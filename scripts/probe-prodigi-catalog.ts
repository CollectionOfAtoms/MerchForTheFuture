/**
 * Probe Prodigi's API to discover valid print SKUs and apparel blank sizes.
 *
 * Usage:
 *   # Print catalog (FAP + CAN):
 *   PRODIGI_API_KEY=your_key npx tsx scripts/probe-prodigi-catalog.ts
 *
 *   # Apparel blank sizes — pass each designed ProductType.providerSkuBase:
 *   PRODIGI_API_KEY=your_key npx tsx scripts/probe-prodigi-catalog.ts RNA1 TOTE ...
 *
 * Prints: outputs a ready-to-paste PRINT_CATALOG for src/lib/print/listing.ts.
 * Apparel: outputs ready-to-paste APPAREL_SIZE_CATALOG entries for
 *   src/lib/apparel/sizes.ts (keyed by providerSkuBase).
 *
 * Prodigi exposes no catalog-listing endpoint; this script queries
 * /v4.0/products/{sku} for each candidate and keeps the 200s.
 */

interface ProdigiProductResponse {
  product?: {
    sku: string;
    description: string;
    productDimensions: { width: number; height: number; units: string };
    // Apparel blanks expose available attribute values and/or per-variant
    // attributes. // UNVERIFIED shape — confirm field paths on first live run.
    attributes?: Record<string, string[]>;
    variants?: Array<{ attributes?: Record<string, string> }>;
  };
}

const API_KEY = process.env.PRODIGI_API_KEY;
if (!API_KEY) {
  console.error("Set PRODIGI_API_KEY before running this script.");
  process.exit(1);
}

// Candidate sizes in inches for each product type.
// Prodigi's FAP range is 4×6 up to 100×50; CAN range is 3×16 up to 119×56.
const FAP_CANDIDATES: [number, number][] = [
  [4, 5], [4, 6], [5, 5], [5, 7],
  [6, 8], [6, 9],
  [8, 8], [8, 10], [8, 12],
  [10, 10], [10, 12], [10, 14],
  [11, 14], [11, 17],
  [12, 12], [12, 16], [12, 18],
  [14, 14], [14, 18], [14, 20],
  [16, 16], [16, 20], [16, 24],
  [18, 18], [18, 24],
  [20, 20], [20, 24], [20, 28], [20, 30],
  [22, 28], [22, 30],
  [24, 24], [24, 30], [24, 36],
  [27, 40],
  [28, 35], [28, 40],
  [30, 30], [30, 40], [30, 45],
  [36, 36], [36, 48],
  [40, 50], [40, 60],
  [48, 60], [48, 72],
  [50, 70], [60, 80],
];

const CAN_CANDIDATES: [number, number][] = [
  [6, 6], [6, 8],
  [8, 8], [8, 10], [8, 12],
  [10, 10], [10, 12], [10, 14],
  [11, 14],
  [12, 12], [12, 16], [12, 18],
  [14, 14], [14, 18], [14, 20],
  [16, 16], [16, 20], [16, 24],
  [18, 18], [18, 24],
  [20, 20], [20, 24], [20, 28], [20, 30],
  [24, 24], [24, 30], [24, 32], [24, 36],
  [28, 35], [28, 40],
  [30, 30], [30, 40],
  [32, 40], [32, 44], [32, 48],
  [36, 36], [36, 40], [36, 48], [36, 50],
  [40, 40], [40, 48], [40, 50], [40, 55], [40, 60],
];

function toSku(prefix: string, w: number, h: number): string {
  return `${prefix}-${w}X${h}`;
}

async function probe(sku: string): Promise<ProdigiProductResponse["product"] | null> {
  const res = await fetch(`https://api.prodigi.com/v4.0/products/${sku}`, {
    headers: { "X-API-Key": API_KEY! },
  });
  if (res.status === 200) {
    const data = (await res.json()) as ProdigiProductResponse;
    return data.product ?? null;
  }
  return null;
}

async function probeBatch(
  prefix: string,
  candidates: [number, number][]
): Promise<Array<{ sku: string; description: string; productDimensions: { width: number; height: number; units: string } }>> {
  const results = [];
  for (const [w, h] of candidates) {
    const sku = toSku(prefix, w, h);
    process.stdout.write(`  ${sku} … `);
    const product = await probe(sku);
    if (product) {
      console.log("✓");
      results.push({ sku: product.sku, description: product.description, productDimensions: product.productDimensions });
    } else {
      console.log("✗");
    }
    // Respect Prodigi's rate limit (120 req/min) — ~550 ms between requests
    await new Promise((r) => setTimeout(r, 550));
  }
  return results;
}

/**
 * Extract a blank's size run from a Prodigi product response. Tries the
 * attribute-values map first, then unique per-variant size attributes.
 * // UNVERIFIED field paths — adjust once confirmed against the live response.
 */
function extractSizes(product: NonNullable<ProdigiProductResponse["product"]>): string[] {
  const fromAttrs = product.attributes?.size ?? product.attributes?.Size;
  if (Array.isArray(fromAttrs) && fromAttrs.length > 0) return fromAttrs;
  const fromVariants = (product.variants ?? [])
    .map((v) => v.attributes?.size ?? v.attributes?.Size)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  return [...new Set(fromVariants)];
}

async function probeApparelSizes(blankSkus: string[]) {
  console.log("\nProbing apparel blank sizes…");
  const entries: Array<{ sku: string; sizes: string[] }> = [];
  for (const sku of blankSkus) {
    process.stdout.write(`  ${sku} … `);
    const product = await probe(sku);
    if (product) {
      const sizes = extractSizes(product);
      console.log(sizes.length > 0 ? `✓ ${sizes.join(", ")}` : "✓ (no sizes found — check field paths)");
      entries.push({ sku, sizes });
    } else {
      console.log("✗");
    }
    await new Promise((r) => setTimeout(r, 550));
  }

  console.log("\n\n// ── Generated APPAREL_SIZE_CATALOG entries (paste into src/lib/apparel/sizes.ts) ──\n");
  for (const e of entries) {
    console.log(`  ${JSON.stringify(e.sku)}: [${e.sizes.map((s) => JSON.stringify(s)).join(", ")}],`);
  }
}

async function main() {
  // Apparel mode: any CLI args are treated as designed-blank SKUs to probe.
  const blankSkus = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (blankSkus.length > 0) {
    await probeApparelSizes(blankSkus);
    return;
  }

  console.log("Probing Fine Art Paper SKUs…");
  const fap = await probeBatch("GLOBAL-FAP", FAP_CANDIDATES);

  console.log("\nProbing Canvas SKUs…");
  const can = await probeBatch("GLOBAL-CAN", CAN_CANDIDATES);

  const all = [...fap, ...can];

  console.log("\n\n// ── Generated PRINT_CATALOG ─────────────────────────────────────────\n");
  console.log("const PRINT_CATALOG: CatalogProduct[] = [");
  for (const p of all) {
    const { width: w, height: h, units } = p.productDimensions;
    console.log(
      `  { sku: "${p.sku}", description: "${p.description}", productDimensions: { width: ${w}, height: ${h}, units: "${units}" } },`
    );
  }
  console.log("];");

  console.log(`\n// Found ${fap.length} FAP + ${can.length} CAN = ${all.length} total SKUs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
