/**
 * Sync designed (Printify) apparel attributes from the live Printify catalog into
 * ProductTypeSizeOption / ProductTypeColor / ProductTypePrintifyVariant rows
 * (US-MFTF-17.2). Unlike Prodigi (one SKU, provider resolves the variant from
 * attributes), a Printify order line needs the exact integer variant_id per
 * (colour,size) — so this also caches the combo→variantId map the fan-out orders
 * against.
 *
 * The catalog is scoped to the curated `(blueprint_id, print_provider_id)` pair
 * pinned on the ProductType. Sizes are replaced wholesale (nothing FK-references
 * them); colours are added ADDITIVELY (ApparelListingColor FK-references
 * ProductTypeColor, so a colour a listing offers is never deleted); combo rows are
 * upserted by their `(productTypeId, colorName, sizeLabel)` unique key.
 */
import { prisma } from "@/lib/db";
import { canonicalSizeLabel, sizeRank } from "@/lib/apparel/sizes";
import { printifyGet, printifyError } from "@/lib/fulfillment/printify/client";

interface PrintifyVariant {
  id?: number;
  options?: { color?: string; size?: string };
}

/**
 * Fetch the orderable variants for one curated (blueprint, print_provider) pair.
 * // UNVERIFIED that a provider-level "enabled" flag should gate exposure — an empty
 * `variants` array is treated as "nothing to sync" (Open Q#8).
 */
export async function fetchPrintifyCuratedVariants(
  blueprintId: number,
  printProviderId: number,
): Promise<PrintifyVariant[]> {
  const res = await printifyGet(
    `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
  );
  if (!res.ok) {
    console.error(
      `[printify] variants ${blueprintId}/${printProviderId} → ${res.status}`,
    );
    return [];
  }
  const data = (await res.json()) as { variants?: PrintifyVariant[] };
  return (data.variants ?? []).filter(
    (v) => typeof v.id === "number" && !!v.options?.color && !!v.options?.size,
  );
}

/**
 * Whether Printify recognises this (blueprint, print_provider) pair with at least
 * one orderable variant — the authoritative existence check used to reject a bogus
 * pair at product-type submit time (BUG-16 precedent for Prodigi SKUs). Throws on a
 * transport error so the caller can tell "Printify says no" from "couldn't reach it".
 */
export async function printifyBlueprintProviderExists(
  blueprintId: number,
  printProviderId: number,
): Promise<boolean> {
  const res = await printifyGet(
    `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
  );
  if (!res.ok) return false;
  const data = (await res.json()) as { variants?: PrintifyVariant[] };
  return (data.variants ?? []).some((v) => typeof v.id === "number");
}

export type SyncOneResult =
  | { ok: true; sizes: string[]; colors: string[]; variants: number }
  | { ok: false; reason: string };

async function syncOneType(type: {
  id: string;
  printifyBlueprintId: number | null;
  printifyPrintProviderId: number | null;
}): Promise<SyncOneResult> {
  if (type.printifyBlueprintId == null || type.printifyPrintProviderId == null) {
    return { ok: false, reason: "missing Printify blueprint/print-provider ids" };
  }

  let variants: PrintifyVariant[];
  try {
    variants = await fetchPrintifyCuratedVariants(type.printifyBlueprintId, type.printifyPrintProviderId);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch failed" };
  }
  if (variants.length === 0) {
    return { ok: false, reason: "no variants returned for the curated (blueprint, provider) pair" };
  }

  const colors = [...new Set(variants.map((v) => v.options!.color!))];
  const rawSizes = [...new Set(variants.map((v) => v.options!.size!))];

  // Sizes: replace wholesale. Store the canonical label + rank order; keep the raw
  // provider spelling in providerSizeCode.
  const ranked = rawSizes
    .map((raw) => ({ raw, label: canonicalSizeLabel(raw), rank: sizeRank(raw) }))
    .sort((a, b) => a.rank - b.rank);
  await prisma.$transaction([
    prisma.productTypeSizeOption.deleteMany({ where: { productTypeId: type.id } }),
    prisma.productTypeSizeOption.createMany({
      data: ranked.map((s, i) => ({
        productTypeId: type.id,
        sizeLabel: s.label,
        providerSizeCode: s.raw,
        sortOrder: i,
      })),
    }),
  ]);

  // Colours: additive (name-only — Printify exposes no hex; admin sets it via UI).
  const existing = await prisma.productTypeColor.findMany({
    where: { productTypeId: type.id },
    select: { colorName: true },
  });
  const have = new Set(existing.map((c) => c.colorName));
  const toCreate = colors.filter((c) => !have.has(c));
  if (toCreate.length > 0) {
    await prisma.productTypeColor.createMany({
      data: toCreate.map((c) => ({ productTypeId: type.id, colorName: c, providerColorCode: c, colorImageUrl: null })),
    });
  }

  // Combo → variant id: upsert by the (productTypeId, colorName, canonical sizeLabel)
  // unique key so a re-sync updates ids in place without duplicating rows.
  for (const v of variants) {
    const colorName = v.options!.color!;
    const sizeLabel = canonicalSizeLabel(v.options!.size!);
    await prisma.productTypePrintifyVariant.upsert({
      where: {
        productTypeId_colorName_sizeLabel: { productTypeId: type.id, colorName, sizeLabel },
      },
      create: { productTypeId: type.id, colorName, sizeLabel, printifyVariantId: v.id! },
      update: { printifyVariantId: v.id! },
    });
  }

  return { ok: true, sizes: rawSizes, colors, variants: variants.length };
}

/**
 * Sync ONE designed (Printify) product type from the curated catalog. Used by the
 * admin per-product "Sync from Printify" action and auto-run once at creation.
 */
export async function syncDesignedProductTypeFromPrintify(productTypeId: string): Promise<SyncOneResult> {
  const type = await prisma.productType.findUnique({
    where: { id: productTypeId },
    select: {
      id: true,
      fulfillmentProvider: true,
      printifyBlueprintId: true,
      printifyPrintProviderId: true,
    },
  });
  if (!type) return { ok: false, reason: "product type not found" };
  if (type.fulfillmentProvider !== "PRINTIFY") return { ok: false, reason: "not a Printify product type" };
  return syncOneType(type);
}

export interface AttrSyncResult {
  total: number;
  synced: Array<{ productTypeId: string; variants: number; sizes: string[]; colors: string[] }>;
  skipped: Array<{ productTypeId: string; reason: string }>;
}

/**
 * Sync ALL designed (Printify) product types in one pass (cron-friendly).
 * Failure-isolated per product type.
 */
export async function syncDesignedAttributesFromPrintify(): Promise<AttrSyncResult> {
  const types = await prisma.productType.findMany({
    where: { fulfillmentProvider: "PRINTIFY" },
    select: { id: true, printifyBlueprintId: true, printifyPrintProviderId: true },
  });
  const result: AttrSyncResult = { total: types.length, synced: [], skipped: [] };
  for (const t of types) {
    const r = await syncOneType(t);
    if (r.ok) result.synced.push({ productTypeId: t.id, variants: r.variants, sizes: r.sizes, colors: r.colors });
    else result.skipped.push({ productTypeId: t.id, reason: r.reason });
  }
  return result;
}
