import { prisma } from "@/lib/db";
import { teemillGet } from "./client";

// ─── Normalized snapshot shape ────────────────────────────────────────────────

export interface TeemillVariantSnapshot {
  variantRef: string;
  colorName: string;
  colorHex: string;
  sizeLabel: string;
  stockLevel: number;
  isOrderable: boolean;
  mockupUrl: string | null;
}

export interface TeemillProductSnapshot {
  providerKey: "teemill";
  /** The product ref/id/slug the seller pasted (stored as providerProductRef). */
  providerProductRef: string;
  title: string;
  slug: string | null;
  providerBaseCurrency: string;
  providerBasePrice: number;
  variants: TeemillVariantSnapshot[];
}

export type IngestResult =
  | { ok: true; snapshot: TeemillProductSnapshot }
  | { ok: false; error: string };

// ─── Raw catalog shapes (only the fields we read) ─────────────────────────────

interface RawAttribute {
  name: string;
  value?: string;
  thumbnail?: { type?: string; value?: string };
}
interface RawImage {
  src: string;
  variantIds?: string[];
}
interface RawMoney {
  amount?: number;
  currencyCode?: string;
}
interface RawVariant {
  id: string;
  ref: string;
  attributes?: RawAttribute[];
  retailPrice?: RawMoney;
  price?: RawMoney;
  stock?: { level?: number };
  images?: RawImage[];
}
interface RawProduct {
  id?: string;
  ref?: string;
  title?: string;
  slug?: string;
  enabled?: boolean;
  images?: RawImage[];
  variants?: RawVariant[];
}

function attr(variant: RawVariant, name: string): RawAttribute | undefined {
  return variant.attributes?.find((a) => a.name?.toLowerCase() === name.toLowerCase());
}

function matchesRef(product: RawProduct, ref: string): boolean {
  const candidates = [product.ref, product.id, product.slug].filter(Boolean) as string[];
  return candidates.some(
    (c) => c === ref || ref.includes(c) || c.includes(ref),
  );
}

function mockupFor(variant: RawVariant, product: RawProduct): string | null {
  const fromVariant = variant.images?.find((img) => img.variantIds?.includes(variant.id));
  if (fromVariant) return fromVariant.src;
  const fromProduct = product.images?.find((img) => img.variantIds?.includes(variant.id));
  return fromProduct?.src ?? null;
}

/**
 * Resolve a Teemill product ref into a normalized snapshot by calling
 * `GET /catalog/products`. Returns `{ ok: false, error }` for not-found / disabled
 * / auth / network failures — these are returned to the caller, never thrown.
 *
 * No design file is uploaded or stored: Teemill owns the design.
 */
export async function ingestTeemillProduct(productRef: string): Promise<IngestResult> {
  let resp: Response;
  try {
    resp = await teemillGet("/catalog/products");
  } catch {
    return { ok: false, error: "Could not reach Teemill. Please try again." };
  }

  if (resp.status === 401 || resp.status === 403) {
    return { ok: false, error: "Teemill authentication failed." };
  }
  if (!resp.ok) {
    return { ok: false, error: `Teemill returned an error (${resp.status}).` };
  }

  let body: { products?: RawProduct[] };
  try {
    body = (await resp.json()) as { products?: RawProduct[] };
  } catch {
    return { ok: false, error: "Teemill returned an unreadable response." };
  }

  const product = (body.products ?? []).find((p) => matchesRef(p, productRef));
  if (!product) {
    return {
      ok: false,
      error:
        "We could not find that product in your Teemill project. Double-check the ref you copied.",
    };
  }
  if (product.enabled === false) {
    return { ok: false, error: "That Teemill product is disabled and cannot be referenced." };
  }

  const rawVariants = product.variants ?? [];
  const variants: TeemillVariantSnapshot[] = rawVariants.map((v) => {
    const colour = attr(v, "Colour");
    const size = attr(v, "Size");
    const stockLevel = v.stock?.level ?? 0;
    return {
      variantRef: v.ref,
      colorName: colour?.value ?? "",
      colorHex: colour?.thumbnail?.value ?? "",
      sizeLabel: size?.value ?? "",
      stockLevel,
      isOrderable: product.enabled !== false && stockLevel > 0,
      mockupUrl: mockupFor(v, product),
    };
  });

  const priceSource = rawVariants[0]?.retailPrice ?? rawVariants[0]?.price;

  return {
    ok: true,
    snapshot: {
      providerKey: "teemill",
      providerProductRef: productRef,
      title: product.title ?? "",
      slug: product.slug ?? null,
      providerBaseCurrency: priceSource?.currencyCode ?? "GBP",
      providerBasePrice: priceSource?.amount ?? 0,
      variants,
    },
  };
}

/**
 * Persist a snapshot onto an existing apparel listing, idempotently. Replaces the
 * listing's `ReferencedVariant` rows and refreshes the cached provider price /
 * currency / `snapshotFetchedAt`. Re-running does not duplicate rows.
 *
 * `preserveOrderableVariantRefs` keeps a row that vanished from the catalog but
 * has order history — it is marked `isOrderable: false` instead of being deleted
 * (US-MFTF-13.4).
 */
export async function applyTeemillSnapshot(
  apparelListingId: string,
  snapshot: TeemillProductSnapshot,
  opts: { preserveOrderableVariantRefs?: string[] } = {},
): Promise<void> {
  const keepRefs = new Set(opts.preserveOrderableVariantRefs ?? []);
  const snapshotRefs = new Set(snapshot.variants.map((v) => v.variantRef));

  await prisma.$transaction(async (tx) => {
    // Drop rows the snapshot no longer contains, except those we must preserve
    // for order history (marked not-orderable instead).
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

    // Upsert each snapshot variant by (listing, variantRef).
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
        providerProductSlug: snapshot.slug,
        providerBaseCurrency: snapshot.providerBaseCurrency,
        providerBasePrice: snapshot.providerBasePrice,
        snapshotFetchedAt: new Date(),
      },
    });
  });
}
