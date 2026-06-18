/**
 * Sync designed (Prodigi) apparel sizes from the live Prodigi catalog into
 * ProductTypeSizeOption rows. Prodigi has no bulk catalog-listing endpoint, so we
 * enumerate our OWN designed product types and GET each blank by its
 * `providerSkuBase` — one pass over the whole catalog of blanks we actually use, no
 * manual SKU list. `toSizes` (src/lib/apparel/detail.ts) reads these rows; blanks
 * that return nothing keep falling back to DEFAULT_APPAREL_SIZES, so listings stay
 * orderable either way.
 *
 * Run it on demand (admin "Sync sizes" action) or on a schedule (cron).
 */
import { prisma } from "@/lib/db";

const PRODIGI_BASE = process.env.PRODIGI_API_BASE_URL ?? "https://api.prodigi.com/v4.0";

interface ProdigiProduct {
  sku?: string;
  attributes?: Record<string, string[]>;
  variants?: Array<{ attributes?: Record<string, string> }>;
}

/**
 * Extract a blank's size run from a Prodigi product response. Tries the
 * attribute-values map first, then unique per-variant size attributes.
 * // UNVERIFIED field paths — confirm against the live response on first run.
 */
export function extractProdigiSizes(product: ProdigiProduct | null | undefined): string[] {
  if (!product) return [];
  const fromAttrs = product.attributes?.size ?? product.attributes?.Size;
  if (Array.isArray(fromAttrs) && fromAttrs.length > 0) return [...new Set(fromAttrs)];
  const fromVariants = (product.variants ?? [])
    .map((v) => v.attributes?.size ?? v.attributes?.Size)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  return [...new Set(fromVariants)];
}

/** Fetch the size run for one Prodigi blank by SKU. Returns [] on failure or none. */
export async function fetchProdigiBlankSizes(providerSkuBase: string): Promise<string[]> {
  const apiKey = process.env.PRODIGI_API_KEY ?? "";
  const res = await fetch(`${PRODIGI_BASE}/products/${encodeURIComponent(providerSkuBase)}`, {
    headers: { "X-API-Key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[prodigi] product ${providerSkuBase} → ${res.status}: ${body || "(empty)"}`);
    return [];
  }
  const data = (await res.json()) as { product?: ProdigiProduct };
  return extractProdigiSizes(data.product);
}

export interface SizeSyncResult {
  total: number;
  synced: Array<{ productTypeId: string; providerSkuBase: string; sizes: string[] }>;
  skipped: Array<{ productTypeId: string; providerSkuBase: string; reason: string }>;
}

/**
 * Sync sizes for ALL designed (Prodigi) product types in one pass. Persists each
 * blank's returned sizes as ProductTypeSizeOption rows (replacing existing rows for
 * that type). Blanks that return no sizes are left untouched. Failure-isolated per
 * blank — one bad fetch never aborts the rest.
 */
export async function syncDesignedSizesFromProdigi(): Promise<SizeSyncResult> {
  const types = await prisma.productType.findMany({
    where: { fulfillmentProvider: "PRODIGI" },
    select: { id: true, providerSkuBase: true },
  });
  const result: SizeSyncResult = { total: types.length, synced: [], skipped: [] };

  for (const t of types) {
    if (!t.providerSkuBase) {
      result.skipped.push({ productTypeId: t.id, providerSkuBase: "", reason: "no providerSkuBase" });
      continue;
    }
    let sizes: string[] = [];
    try {
      sizes = await fetchProdigiBlankSizes(t.providerSkuBase);
    } catch (e) {
      result.skipped.push({ productTypeId: t.id, providerSkuBase: t.providerSkuBase, reason: e instanceof Error ? e.message : "fetch failed" });
      continue;
    }
    if (sizes.length === 0) {
      result.skipped.push({ productTypeId: t.id, providerSkuBase: t.providerSkuBase, reason: "no sizes returned" });
      continue;
    }
    await prisma.$transaction([
      prisma.productTypeSizeOption.deleteMany({ where: { productTypeId: t.id } }),
      prisma.productTypeSizeOption.createMany({
        data: sizes.map((s, i) => ({ productTypeId: t.id, sizeLabel: s, providerSizeCode: s, sortOrder: i })),
      }),
    ]);
    result.synced.push({ productTypeId: t.id, providerSkuBase: t.providerSkuBase, sizes });
  }
  return result;
}
