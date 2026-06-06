export interface PrintProduct {
  sku: string;
  description?: string;
  size: string;
  price: number;
}

export interface CatalogProduct {
  sku: string;
  description: string;
  productDimensions: { width: number; height: number; units: string };
}

// Verified against the live Prodigi API via scripts/probe-prodigi-catalog.ts.
// All dimensions normalized to inches (the API occasionally returns cm for some
// entries; the SKU always encodes the canonical inch dimensions).
// Re-run the probe script after any Prodigi contract changes.
const PRINT_CATALOG: CatalogProduct[] = [
  // ── Fine Art Paper — Enhanced Matte Art Paper, 200 GSM ──────────────────
  { sku: "GLOBAL-FAP-4X6",   description: "EMA, Enhanced Matte Art Paper, 200gsm, 10x15cm / 4x6\"",          productDimensions: { width: 4,  height: 6,  units: "in" } },
  { sku: "GLOBAL-FAP-5X7",   description: "EMA, Enhanced Matte Art Paper, 200gsm, 13x18cm / 5x7\"",          productDimensions: { width: 5,  height: 7,  units: "in" } },
  { sku: "GLOBAL-FAP-6X8",   description: "EMA, Enhanced Matte Art Paper, 200gsm, 15x20cm / 6x8\"",          productDimensions: { width: 6,  height: 8,  units: "in" } },
  { sku: "GLOBAL-FAP-6X9",   description: "EMA, Enhanced Matte Art Paper, 200gsm, 15.2x22.9cm / 6x9\"",      productDimensions: { width: 6,  height: 9,  units: "in" } },
  { sku: "GLOBAL-FAP-8X8",   description: "EMA, Enhanced Matte Art Paper, 200gsm, 20x20cm / 8x8\"",          productDimensions: { width: 8,  height: 8,  units: "in" } },
  { sku: "GLOBAL-FAP-8X10",  description: "EMA, Enhanced Matte Art Paper, 200gsm, 20x25cm / 8x10\"",         productDimensions: { width: 8,  height: 10, units: "in" } },
  { sku: "GLOBAL-FAP-8X12",  description: "EMA, Enhanced Matte Art Paper, 200gsm, 20x30cm / 8x12\"",         productDimensions: { width: 8,  height: 12, units: "in" } },
  { sku: "GLOBAL-FAP-10X10", description: "EMA, Enhanced Matte Art Paper, 200gsm, 25x25cm / 10x10\"",        productDimensions: { width: 10, height: 10, units: "in" } },
  { sku: "GLOBAL-FAP-10X12", description: "EMA, Enhanced Matte Art Paper, 200gsm, 25x30cm / 10x12\"",        productDimensions: { width: 10, height: 12, units: "in" } },
  { sku: "GLOBAL-FAP-11X14", description: "EMA, Enhanced Matte Art Paper, 200gsm, 28x35.5cm / 11x14\"",      productDimensions: { width: 11, height: 14, units: "in" } },
  { sku: "GLOBAL-FAP-11X17", description: "EMA, Enhanced Matte Art Paper, 200gsm, 28x43cm / 11x17\"",        productDimensions: { width: 11, height: 17, units: "in" } },
  { sku: "GLOBAL-FAP-12X12", description: "EMA, Enhanced Matte Art Paper, 200gsm, 30x30cm / 12x12\"",        productDimensions: { width: 12, height: 12, units: "in" } },
  { sku: "GLOBAL-FAP-12X16", description: "EMA, Enhanced Matte Art Paper, 200gsm, 30x40cm / 12x16\"",        productDimensions: { width: 12, height: 16, units: "in" } },
  { sku: "GLOBAL-FAP-12X18", description: "EMA, Enhanced Matte Art Paper, 200gsm, 30x45cm / 12x18\"",        productDimensions: { width: 12, height: 18, units: "in" } },
  { sku: "GLOBAL-FAP-14X14", description: "EMA, Enhanced Matte Art Paper, 200gsm, 36x36cm / 14x14\"",        productDimensions: { width: 14, height: 14, units: "in" } },
  { sku: "GLOBAL-FAP-16X16", description: "EMA, Enhanced Matte Art Paper, 200gsm, 40x40cm / 16x16\"",        productDimensions: { width: 16, height: 16, units: "in" } },
  { sku: "GLOBAL-FAP-16X20", description: "EMA, Enhanced Matte Art Paper, 200gsm, 40x50cm / 16x20\"",        productDimensions: { width: 16, height: 20, units: "in" } },
  { sku: "GLOBAL-FAP-16X24", description: "EMA, Enhanced Matte Art Paper, 200gsm, 40x60cm / 16x24\"",        productDimensions: { width: 16, height: 24, units: "in" } },
  { sku: "GLOBAL-FAP-18X18", description: "EMA, Enhanced Matte Art Paper, 200gsm, 45x45cm / 18x18\"",        productDimensions: { width: 18, height: 18, units: "in" } },
  { sku: "GLOBAL-FAP-18X24", description: "EMA, Enhanced Matte Art Paper, 200gsm, 45x60cm / 18x24\"",        productDimensions: { width: 18, height: 24, units: "in" } },
  { sku: "GLOBAL-FAP-20X20", description: "EMA, Enhanced Matte Art Paper, 200gsm, 50x50cm / 20x20\"",        productDimensions: { width: 20, height: 20, units: "in" } },
  { sku: "GLOBAL-FAP-20X24", description: "EMA, Enhanced Matte Art Paper, 200gsm, 50x60cm / 20x24\"",        productDimensions: { width: 20, height: 24, units: "in" } },
  { sku: "GLOBAL-FAP-20X28", description: "EMA, Enhanced Matte Art Paper, 200gsm, 50x70cm / 20x28\"",        productDimensions: { width: 20, height: 28, units: "in" } },
  { sku: "GLOBAL-FAP-20X30", description: "EMA, Enhanced Matte Art Paper, 200gsm, 50x75cm / 20x30\"",        productDimensions: { width: 20, height: 30, units: "in" } },
  { sku: "GLOBAL-FAP-22X30", description: "EMA, Enhanced Matte Art Paper, 200gsm, 56x76cm / 22x29.9\"",      productDimensions: { width: 22, height: 30, units: "in" } },
  { sku: "GLOBAL-FAP-24X24", description: "EMA, Enhanced Matte Art Paper, 200gsm, 60x60cm / 24x24\"",        productDimensions: { width: 24, height: 24, units: "in" } },
  { sku: "GLOBAL-FAP-24X30", description: "EMA, Enhanced Matte Art Paper, 200gsm, 60x76cm / 24x30\"",        productDimensions: { width: 24, height: 30, units: "in" } },
  { sku: "GLOBAL-FAP-24X36", description: "EMA, Enhanced Matte Art Paper, 200gsm, 60x90cm / 24x36\"",        productDimensions: { width: 24, height: 36, units: "in" } },
  { sku: "GLOBAL-FAP-28X40", description: "EMA, Enhanced Matte Art Paper, 200gsm, 70x100cm / 28x40\"",       productDimensions: { width: 28, height: 40, units: "in" } },
  { sku: "GLOBAL-FAP-30X30", description: "EMA, Enhanced Matte Art Paper, 200gsm, 75x75cm / 30x30\"",        productDimensions: { width: 30, height: 30, units: "in" } },
  { sku: "GLOBAL-FAP-30X40", description: "EMA, Enhanced Matte Art Paper, 200gsm, 75x100cm / 30x40\"",       productDimensions: { width: 30, height: 40, units: "in" } },
  { sku: "GLOBAL-FAP-30X45", description: "EMA, Enhanced Matte Art Paper, 200gsm, 76.2x114.3cm / 30x45\"",   productDimensions: { width: 30, height: 45, units: "in" } },
  { sku: "GLOBAL-FAP-36X36", description: "EMA, Enhanced Matte Art Paper, 200gsm, 90x90cm / 36x36\"",        productDimensions: { width: 36, height: 36, units: "in" } },
  { sku: "GLOBAL-FAP-36X48", description: "EMA, Enhanced Matte Art Paper, 200gsm, 90x120cm / 36x48\"",       productDimensions: { width: 36, height: 48, units: "in" } },
  { sku: "GLOBAL-FAP-40X50", description: "EMA, Enhanced Matte Art Paper, 200gsm, 100x127cm / 40x50\"",      productDimensions: { width: 40, height: 50, units: "in" } },
  { sku: "GLOBAL-FAP-40X60", description: "EMA, Enhanced Matte Art Paper, 200gsm, 100x150cm / 40x60\"",      productDimensions: { width: 40, height: 60, units: "in" } },
  { sku: "GLOBAL-FAP-48X60", description: "EMA, Enhanced Matte Art Paper, 200gsm, 120x152cm / 48x60\"",      productDimensions: { width: 48, height: 60, units: "in" } },
  // ── Stretched Canvas — 400 GSM cotton, 38 mm standard stretcher bar ─────
  { sku: "GLOBAL-CAN-6X6",   description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 6x6\" / 15x15cm",     productDimensions: { width: 6,  height: 6,  units: "in" } },
  { sku: "GLOBAL-CAN-6X8",   description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 6x8\" / 15x20cm",     productDimensions: { width: 6,  height: 8,  units: "in" } },
  { sku: "GLOBAL-CAN-8X8",   description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 8x8\" / 20x20cm",     productDimensions: { width: 8,  height: 8,  units: "in" } },
  { sku: "GLOBAL-CAN-8X10",  description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 8x10\" / 20x25cm",    productDimensions: { width: 8,  height: 10, units: "in" } },
  { sku: "GLOBAL-CAN-8X12",  description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 8x12\" / 20x30cm",    productDimensions: { width: 8,  height: 12, units: "in" } },
  { sku: "GLOBAL-CAN-10X10", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 10x10\" / 25x25cm",   productDimensions: { width: 10, height: 10, units: "in" } },
  { sku: "GLOBAL-CAN-10X12", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 10x12\" / 25x31cm",   productDimensions: { width: 10, height: 12, units: "in" } },
  { sku: "GLOBAL-CAN-11X14", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 11x14\" / 28x36cm",   productDimensions: { width: 11, height: 14, units: "in" } },
  { sku: "GLOBAL-CAN-12X12", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 12x12\" / 31x31cm",   productDimensions: { width: 12, height: 12, units: "in" } },
  { sku: "GLOBAL-CAN-12X16", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 12x16\" / 31x41cm",   productDimensions: { width: 12, height: 16, units: "in" } },
  { sku: "GLOBAL-CAN-12X18", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 12x18\" / 30x46cm",   productDimensions: { width: 12, height: 18, units: "in" } },
  { sku: "GLOBAL-CAN-14X14", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 14x14\" / 36x36cm",   productDimensions: { width: 14, height: 14, units: "in" } },
  { sku: "GLOBAL-CAN-16X16", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 16x16\" / 41x41cm",   productDimensions: { width: 16, height: 16, units: "in" } },
  { sku: "GLOBAL-CAN-16X20", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 16x20\" / 41x51cm",   productDimensions: { width: 16, height: 20, units: "in" } },
  { sku: "GLOBAL-CAN-16X24", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 16x24\" / 41x61cm",   productDimensions: { width: 16, height: 24, units: "in" } },
  { sku: "GLOBAL-CAN-18X18", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 18x18\" / 46x46cm",   productDimensions: { width: 18, height: 18, units: "in" } },
  { sku: "GLOBAL-CAN-18X24", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 18x24\" / 46x61cm",   productDimensions: { width: 18, height: 24, units: "in" } },
  { sku: "GLOBAL-CAN-20X20", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 20x20\" / 51x51cm",   productDimensions: { width: 20, height: 20, units: "in" } },
  { sku: "GLOBAL-CAN-20X24", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 20x24\" / 51x61cm",   productDimensions: { width: 20, height: 24, units: "in" } },
  { sku: "GLOBAL-CAN-20X28", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 20x28\" / 51x71cm",   productDimensions: { width: 20, height: 28, units: "in" } },
  { sku: "GLOBAL-CAN-20X30", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 20x30\" / 51x76cm",   productDimensions: { width: 20, height: 30, units: "in" } },
  { sku: "GLOBAL-CAN-24X24", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 24x24\" / 61x61cm",   productDimensions: { width: 24, height: 24, units: "in" } },
  { sku: "GLOBAL-CAN-24X30", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 24x30\" / 61x76cm",   productDimensions: { width: 24, height: 30, units: "in" } },
  { sku: "GLOBAL-CAN-24X32", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 24x32\" / 61x81cm",   productDimensions: { width: 24, height: 32, units: "in" } },
  { sku: "GLOBAL-CAN-24X36", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 24x36\" / 61x91cm",   productDimensions: { width: 24, height: 36, units: "in" } },
  { sku: "GLOBAL-CAN-28X40", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 28x40\" / 71x102cm",  productDimensions: { width: 28, height: 40, units: "in" } },
  { sku: "GLOBAL-CAN-30X30", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 30x30\" / 76x76cm",   productDimensions: { width: 30, height: 30, units: "in" } },
  { sku: "GLOBAL-CAN-30X40", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 30x40\" / 76x102cm",  productDimensions: { width: 30, height: 40, units: "in" } },
  { sku: "GLOBAL-CAN-32X40", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 32x40\" / 81x102cm",  productDimensions: { width: 32, height: 40, units: "in" } },
  { sku: "GLOBAL-CAN-32X44", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 32x44\" / 81x112cm",  productDimensions: { width: 32, height: 44, units: "in" } },
  { sku: "GLOBAL-CAN-32X48", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 32x48\" / 81x122cm",  productDimensions: { width: 32, height: 48, units: "in" } },
  { sku: "GLOBAL-CAN-36X36", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 36x36\" / 91x91cm",   productDimensions: { width: 36, height: 36, units: "in" } },
  { sku: "GLOBAL-CAN-36X40", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 36x40\" / 91x102cm",  productDimensions: { width: 36, height: 40, units: "in" } },
  { sku: "GLOBAL-CAN-36X48", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 36x48\" / 91x122cm",  productDimensions: { width: 36, height: 48, units: "in" } },
  { sku: "GLOBAL-CAN-36X50", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 36x50\" / 91x127cm",  productDimensions: { width: 36, height: 50, units: "in" } },
  { sku: "GLOBAL-CAN-40X40", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 40x40\" / 102x102cm", productDimensions: { width: 40, height: 40, units: "in" } },
  { sku: "GLOBAL-CAN-40X48", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 40x48\" / 102x122cm", productDimensions: { width: 40, height: 48, units: "in" } },
  { sku: "GLOBAL-CAN-40X50", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 40x50\" / 102x127cm", productDimensions: { width: 40, height: 50, units: "in" } },
  { sku: "GLOBAL-CAN-40X55", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 40x55\" / 102x140cm", productDimensions: { width: 40, height: 55, units: "in" } },
  { sku: "GLOBAL-CAN-40X60", description: "Stretched Canvas on a 38mm Standard Stretcher Bar, 40x60\" / 102x152cm", productDimensions: { width: 40, height: 60, units: "in" } },
];

export function getPrintCatalog(): CatalogProduct[] {
  return PRINT_CATALOG;
}

/**
 * Parse a free-text artwork dimensions string into inches.
 * Handles formats like: 24" × 36"  |  16 x 20 in  |  60 × 90 cm  |  24x36
 * Returns null if unparseable.
 */
export function parseArtworkDimensions(str: string | null | undefined): { widthIn: number; heightIn: number } | null {
  if (!str) return null;
  const m = str.match(/(\d+(?:\.\d+)?)\s*["″']?\s*[×xX]\s*(\d+(?:\.\d+)?)\s*(cm|mm|in|inches|["″'])?/i);
  if (!m) return null;
  let w = parseFloat(m[1]);
  let h = parseFloat(m[2]);
  const unit = (m[3] ?? "in").toLowerCase();
  if (unit === "cm") { w /= 2.54; h /= 2.54; }
  else if (unit === "mm") { w /= 25.4; h /= 25.4; }
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null;
  return { widthIn: w, heightIn: h };
}

const RATIO_TOLERANCE = 0.10;

export function normalizedRatio(w: number, h: number): number {
  return Math.max(w, h) / Math.min(w, h);
}

export function filterByAspectRatio(
  catalog: CatalogProduct[],
  dims: { widthIn: number; heightIn: number } | null,
  savedSkus?: Set<string>,
): CatalogProduct[] {
  if (!dims) return catalog;

  const artRatio = normalizedRatio(dims.widthIn, dims.heightIn);
  const saved = savedSkus ?? new Set<string>();

  const matched: CatalogProduct[] = [];
  const savedOutsideRatio: CatalogProduct[] = [];

  for (const p of catalog) {
    const { width, height } = p.productDimensions;
    const pRatio = normalizedRatio(width, height);
    const withinTolerance = Math.abs(pRatio - artRatio) / artRatio <= RATIO_TOLERANCE;

    if (withinTolerance) {
      matched.push(p);
    } else if (saved.has(p.sku)) {
      savedOutsideRatio.push(p);
    }
  }

  const base = matched.length > 0 ? [...matched] : [...catalog];
  base.sort((a, b) => {
    const aRatio = normalizedRatio(a.productDimensions.width, a.productDimensions.height);
    const bRatio = normalizedRatio(b.productDimensions.width, b.productDimensions.height);
    return Math.abs(aRatio - artRatio) - Math.abs(bRatio - artRatio);
  });

  return [...base, ...savedOutsideRatio];
}
