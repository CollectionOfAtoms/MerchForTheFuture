/**
 * Sync designed (Prodigi) apparel attributes — sizes AND colours — from the live
 * Prodigi catalog into ProductTypeSizeOption / ProductTypeColor rows. Prodigi has
 * no bulk catalog-listing endpoint, so we enumerate our OWN designed product types
 * and GET each blank by its `providerSkuBase` (one pass, no manual SKU list).
 *
 * Sizes are replaced wholesale (nothing FK-references them). Colours are added
 * ADDITIVELY (create missing by name, never delete) because ApparelListingColor
 * holds a required FK to ProductTypeColor — deleting a colour a listing offers
 * would violate it.
 *
 * `toSizes`/`toColors` (src/lib/apparel/detail.ts) and the seller new-listing form
 * read these rows; blanks that return nothing keep the size fallback and simply
 * have no colours until synced. Run on demand (admin button) or a cron.
 */
import { prisma } from "@/lib/db";

const PRODIGI_BASE = process.env.PRODIGI_API_BASE_URL ?? "https://api.prodigi.com/v4.0";

interface ProdigiProduct {
  sku?: string;
  attributes?: Record<string, unknown>;
  variants?: Array<{ attributes?: Record<string, unknown> }>;
}

function attrValues(attrs: Record<string, unknown> | undefined, keys: string[]): string[] {
  if (!attrs) return [];
  for (const k of keys) {
    const v = attrs[k];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  return [];
}

function variantValue(attrs: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!attrs) return null;
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

const SIZE_KEYS = ["size", "Size"];
const COLOUR_KEYS = ["color", "colour", "Color", "Colour"];

/** Sizes for a blank. // UNVERIFIED field paths — confirm on first live run. */
export function extractProdigiSizes(product: ProdigiProduct | null | undefined): string[] {
  if (!product) return [];
  const fromAttrs = attrValues(product.attributes, SIZE_KEYS);
  if (fromAttrs.length > 0) return [...new Set(fromAttrs)];
  const fromVariants = (product.variants ?? [])
    .map((v) => variantValue(v.attributes, SIZE_KEYS))
    .filter((s): s is string => !!s);
  return [...new Set(fromVariants)];
}

/** Colour names for a blank. // UNVERIFIED field paths — confirm on first live run. */
export function extractProdigiColors(product: ProdigiProduct | null | undefined): string[] {
  if (!product) return [];
  const fromAttrs = attrValues(product.attributes, COLOUR_KEYS);
  if (fromAttrs.length > 0) return [...new Set(fromAttrs)];
  const fromVariants = (product.variants ?? [])
    .map((v) => variantValue(v.attributes, COLOUR_KEYS))
    .filter((s): s is string => !!s);
  return [...new Set(fromVariants)];
}

export interface ProdigiBlankAttributes {
  sizes: string[];
  colors: string[];
}

/** Fetch sizes + colours for one Prodigi blank by SKU (single GET). */
export async function fetchProdigiBlankAttributes(providerSkuBase: string): Promise<ProdigiBlankAttributes> {
  const apiKey = process.env.PRODIGI_API_KEY ?? "";
  const res = await fetch(`${PRODIGI_BASE}/products/${encodeURIComponent(providerSkuBase)}`, {
    headers: { "X-API-Key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[prodigi] product ${providerSkuBase} → ${res.status}: ${body || "(empty)"}`);
    return { sizes: [], colors: [] };
  }
  const data = (await res.json()) as { product?: ProdigiProduct };
  const sizes = extractProdigiSizes(data.product);
  const colors = extractProdigiColors(data.product);
  // Diagnostic: dump the raw product when nothing parsed (or on demand) so the
  // attribute/swatch field paths can be confirmed against the live response —
  // Prodigi exposes no confirmed colour swatch/hex field, so colours sync as
  // selectable names (no swatch) unless the raw shows otherwise. // UNVERIFIED
  if (process.env.DROPSHIPPING_DEBUG || (sizes.length === 0 && colors.length === 0)) {
    console.log(`[prodigi] product ${providerSkuBase} raw (sizes=${sizes.length}, colors=${colors.length}):\n` + JSON.stringify(data.product ?? data, null, 2));
  }
  return { sizes, colors };
}

export interface AttrSyncResult {
  total: number;
  synced: Array<{ productTypeId: string; providerSkuBase: string; sizes: string[]; colors: string[] }>;
  skipped: Array<{ productTypeId: string; providerSkuBase: string; reason: string }>;
}

/**
 * Sync sizes + colours for ALL designed (Prodigi) product types in one pass.
 * Sizes replace existing rows; colours are added additively (new names only).
 * Failure-isolated per blank.
 */
export async function syncDesignedAttributesFromProdigi(): Promise<AttrSyncResult> {
  const types = await prisma.productType.findMany({
    where: { fulfillmentProvider: "PRODIGI" },
    select: { id: true, providerSkuBase: true },
  });
  const result: AttrSyncResult = { total: types.length, synced: [], skipped: [] };

  for (const t of types) {
    if (!t.providerSkuBase) {
      result.skipped.push({ productTypeId: t.id, providerSkuBase: "", reason: "no providerSkuBase" });
      continue;
    }
    let attrs: ProdigiBlankAttributes;
    try {
      attrs = await fetchProdigiBlankAttributes(t.providerSkuBase);
    } catch (e) {
      result.skipped.push({ productTypeId: t.id, providerSkuBase: t.providerSkuBase, reason: e instanceof Error ? e.message : "fetch failed" });
      continue;
    }
    if (attrs.sizes.length === 0 && attrs.colors.length === 0) {
      result.skipped.push({ productTypeId: t.id, providerSkuBase: t.providerSkuBase, reason: "no attributes returned" });
      continue;
    }

    // Sizes: replace wholesale (no FK references them).
    if (attrs.sizes.length > 0) {
      await prisma.$transaction([
        prisma.productTypeSizeOption.deleteMany({ where: { productTypeId: t.id } }),
        prisma.productTypeSizeOption.createMany({
          data: attrs.sizes.map((s, i) => ({ productTypeId: t.id, sizeLabel: s, providerSizeCode: s, sortOrder: i })),
        }),
      ]);
    }

    // Colours: additive — create only names not already present (ApparelListingColor
    // FK-references ProductTypeColor, so we never delete).
    if (attrs.colors.length > 0) {
      const existing = await prisma.productTypeColor.findMany({
        where: { productTypeId: t.id },
        select: { colorName: true },
      });
      const have = new Set(existing.map((c) => c.colorName));
      const toCreate = attrs.colors.filter((c) => !have.has(c));
      if (toCreate.length > 0) {
        await prisma.productTypeColor.createMany({
          data: toCreate.map((c) => ({ productTypeId: t.id, colorName: c, providerColorCode: c, colorImageUrl: null })),
        });
      }
    }

    result.synced.push({ productTypeId: t.id, providerSkuBase: t.providerSkuBase, sizes: attrs.sizes, colors: attrs.colors });
  }
  return result;
}
