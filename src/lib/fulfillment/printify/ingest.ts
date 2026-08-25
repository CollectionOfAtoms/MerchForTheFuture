import { prisma } from "@/lib/db";
import { colorNameToHex } from "@/lib/apparel/color-hex";
import { printifyGet, resolvePrintifyShopId } from "./client";

// US-MFTF-17.12 — REFERENCED Printify ingest. Caches a product built in our OWN
// Printify shop (`GET /shops/{shop_id}/products/{id}.json`) into the existing
// MFTF-13 referenced schema, so a referenced Printify listing renders and orders
// through the same normalized pipeline Teemill already uses. The design lives on the
// Printify product (not on the order), exactly the Teemill (referenced) pattern with
// the shop being ours.

// ─── Normalized snapshot shape ────────────────────────────────────────────────

export interface PrintifyVariantSnapshot {
  /** The Printify integer `variant_id`, stored as a string (US-MFTF-17.14 orders by it). */
  variantRef: string;
  colorName: string;
  colorHex: string;
  sizeLabel: string;
  /**
   * Printify products are print-on-demand — the product read exposes no warehouse
   * count — so this is always 0 and `isOrderable` (enabled + available) is the real
   * orderability signal, mirroring the Teemill POD treatment (BUG-13).
   */
  stockLevel: number;
  isOrderable: boolean;
  mockupUrl: string | null;
}

export interface PrintifyProductSnapshot {
  providerKey: "printify";
  /** The Printify `product_id` (stored as providerProductRef). */
  providerProductRef: string;
  title: string;
  /** The product description as returned by Printify (may be HTML). */
  description: string | null;
  providerBaseCurrency: "USD";
  /** Base cost in USD dollars (Printify quotes integer cents; divided by 100). */
  providerBasePrice: number;
  variants: PrintifyVariantSnapshot[];
}

export type PrintifyIngestResult =
  | { ok: true; snapshot: PrintifyProductSnapshot }
  | { ok: false; error: string };

// ─── Raw product shape (only the fields we read) ──────────────────────────────
// Shape LIVE-VERIFIED 2026-08-25 against a real shop product. `product.options` is an
// array of option TYPE definitions (a "color" type + a "size" type, each with an
// id→title[+hex] value table); each `variant.options` is an array of value ids (order
// not fixed) resolved against that table. `variant.cost` is our production cost in USD
// cents; `is_enabled` = the merchant offers it, `is_available` = the print provider can
// currently fulfil it (the orderability signal).

interface RawImage {
  src: string;
  variant_ids?: number[];
  is_default?: boolean;
  position?: string;
}
interface RawOptionValue {
  id: number;
  title?: string;
  colors?: string[];
}
interface RawOption {
  name?: string;
  type?: string; // "color" | "size" | …
  values?: RawOptionValue[];
}
interface RawVariant {
  id: number;
  title?: string;
  /** Our production cost in USD integer cents. */
  cost?: number;
  /** Printify's retail price in USD integer cents. */
  price?: number;
  /** Option-value ids (colour + size), order not fixed — resolved via product.options. */
  options?: number[];
  is_enabled?: boolean;
  is_available?: boolean;
}
interface RawProduct {
  id?: string;
  title?: string;
  description?: string | null;
  visible?: boolean;
  options?: RawOption[];
  images?: RawImage[];
  variants?: RawVariant[];
}

interface ResolvedOptionValue {
  type: string;
  title: string;
  hex?: string;
}

/** Build an option-value-id → { type, title, hex } lookup from product.options. */
function buildOptionValueMap(product: RawProduct): Map<number, ResolvedOptionValue> {
  const map = new Map<number, ResolvedOptionValue>();
  for (const opt of product.options ?? []) {
    for (const val of opt.values ?? []) {
      map.set(val.id, { type: opt.type ?? "", title: val.title ?? "", hex: val.colors?.[0] });
    }
  }
  return map;
}

/**
 * Extract a Printify shop `product_id` from a pasted product URL or a bare id
 * (US-MFTF-17.13). Printify product ids are 24-char hex (Mongo ObjectId); a merchant
 * product URL looks like `https://printify.com/app/store/products/{id}`. Returns the
 * 24-hex id found anywhere in the input, else a bare token with no whitespace/slashes,
 * else null.
 */
export function parsePrintifyProductId(input: string | null | undefined): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  const hex = trimmed.match(/[0-9a-f]{24}/i);
  if (hex) return hex[0];
  // A bare id token that isn't 24-hex — accept it and let the API 404 if invalid.
  if (!/[\s/]/.test(trimmed)) return trimmed;
  return null;
}

/** The per-colour mockup for a variant: the product image whose variant_ids include it. */
function mockupFor(variant: RawVariant, product: RawProduct): string | null {
  const match = product.images?.find((img) => img.variant_ids?.includes(variant.id));
  return match?.src ?? null;
}

/**
 * Resolve a Printify shop `product_id` into a normalized referenced snapshot.
 * Returns `{ ok: false, error }` for not-found / auth / network failures — these are
 * returned to the caller, never thrown (mirrors ingestTeemillProduct).
 *
 * No design file is uploaded or stored: the Printify product owns the design.
 */
export async function ingestPrintifyProduct(productId: string): Promise<PrintifyIngestResult> {
  let shopId: string;
  try {
    shopId = await resolvePrintifyShopId();
  } catch {
    return { ok: false, error: "Could not reach Printify. Please try again." };
  }

  let resp: Response;
  try {
    resp = await printifyGet(`/shops/${shopId}/products/${productId}.json`);
  } catch {
    return { ok: false, error: "Could not reach Printify. Please try again." };
  }

  if (resp.status === 401 || resp.status === 403) {
    return { ok: false, error: "Printify authentication failed." };
  }
  if (resp.status === 404) {
    return {
      ok: false,
      error:
        "We could not find that product in your Printify shop. Double-check the product URL or id you copied.",
    };
  }
  if (!resp.ok) {
    return { ok: false, error: `Printify returned an error (${resp.status}).` };
  }

  let product: RawProduct;
  try {
    product = (await resp.json()) as RawProduct;
  } catch {
    return { ok: false, error: "Printify returned an unreadable response." };
  }

  const optionValues = buildOptionValueMap(product);
  // Only the variants the merchant enabled are offered (a Printify product carries the
  // full blueprint grid; the founder curates which colour/size combos to sell).
  const offered = (product.variants ?? []).filter((v) => v.is_enabled !== false);

  const variants: PrintifyVariantSnapshot[] = offered.map((v) => {
    let colorName = "";
    let colorHex = "";
    let sizeLabel = "";
    for (const id of v.options ?? []) {
      const ov = optionValues.get(id);
      if (!ov) continue;
      if (ov.type === "color") {
        colorName = ov.title;
        if (ov.hex) colorHex = ov.hex;
      } else if (ov.type === "size") {
        sizeLabel = ov.title;
      }
    }
    // Printify usually supplies the colour hex on the option value; fall back to our
    // name→hex map only when it doesn't.
    if (!colorHex) colorHex = colorNameToHex(colorName) ?? "";
    return {
      variantRef: String(v.id),
      colorName,
      colorHex,
      sizeLabel,
      stockLevel: 0,
      // Enabled variants that the print provider can't currently fulfil are cached but
      // not orderable (checkout revalidation is the gate) — the Teemill isOrderable pattern.
      isOrderable: v.is_available !== false,
      mockupUrl: mockupFor(v, product),
    };
  });

  // Base cost for margin monitoring = Printify's production cost (USD cents → dollars).
  const costCents = offered[0]?.cost ?? 0;

  return {
    ok: true,
    snapshot: {
      providerKey: "printify",
      providerProductRef: productId,
      title: product.title ?? "",
      description: product.description ?? null,
      providerBaseCurrency: "USD",
      providerBasePrice: costCents / 100,
      variants,
    },
  };
}

/**
 * Persist a Printify snapshot onto an existing apparel listing, idempotently.
 * Replaces the listing's `ReferencedVariant` rows and refreshes the cached provider
 * price / currency / `snapshotFetchedAt`. Re-running does not duplicate rows.
 *
 * `preserveOrderableVariantRefs` keeps a row that vanished from the product but has
 * order history — marked `isOrderable: false` instead of deleted (US-MFTF-13.4).
 * Mirrors applyTeemillSnapshot; a referenced Printify listing has no product slug.
 */
export async function applyPrintifySnapshot(
  apparelListingId: string,
  snapshot: PrintifyProductSnapshot,
  opts: { preserveOrderableVariantRefs?: string[] } = {},
): Promise<void> {
  const keepRefs = new Set(opts.preserveOrderableVariantRefs ?? []);
  const snapshotRefs = new Set(snapshot.variants.map((v) => v.variantRef));

  await prisma.$transaction(async (tx) => {
    await tx.referencedVariant.deleteMany({
      where: {
        apparelListingId,
        variantRef: { notIn: [...snapshotRefs, ...keepRefs] },
      },
    });
    await tx.referencedVariant.updateMany({
      where: {
        apparelListingId,
        variantRef: { in: [...keepRefs].filter((r) => !snapshotRefs.has(r)) },
      },
      data: { isOrderable: false },
    });

    for (const v of snapshot.variants) {
      const existing = await tx.referencedVariant.findFirst({
        where: { apparelListingId, variantRef: v.variantRef },
        select: { id: true },
      });
      const data = {
        colorName: v.colorName,
        colorHex: v.colorHex,
        sizeLabel: v.sizeLabel,
        stockLevel: v.stockLevel,
        isOrderable: v.isOrderable,
        mockupUrl: v.mockupUrl,
      };
      if (existing) {
        await tx.referencedVariant.update({ where: { id: existing.id }, data });
      } else {
        await tx.referencedVariant.create({
          data: { apparelListingId, variantRef: v.variantRef, ...data },
        });
      }
    }

    await tx.apparelListing.update({
      where: { id: apparelListingId },
      data: {
        providerBaseCurrency: snapshot.providerBaseCurrency,
        providerBasePrice: snapshot.providerBasePrice,
        snapshotFetchedAt: new Date(),
      },
    });
  });
}
