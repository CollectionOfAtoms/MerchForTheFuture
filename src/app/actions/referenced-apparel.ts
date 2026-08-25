"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ingestTeemillProduct, applyTeemillSnapshot } from "@/lib/fulfillment/teemill";
import type { TeemillProductSnapshot } from "@/lib/fulfillment/teemill";
import {
  ingestPrintifyProduct,
  applyPrintifySnapshot,
  parsePrintifyProductId,
  transparentizePrintifyMockups,
} from "@/lib/fulfillment/printify";
import type { PrintifyProductSnapshot } from "@/lib/fulfillment/printify";
import {
  referencedListingColors,
  referencedListingSizes,
  teemillDescriptionToText,
} from "@/lib/apparel/referenced";
import { getManagerActor, canManageListing } from "@/lib/seller/authz";

type ActionResult = { error: string } | undefined;

const MAX_LIFESTYLE_PHOTOS = 10;

/** Returns the seller's user id, or null if the caller is not a signed-in seller. */
async function getSellerId(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id || !user.roles?.includes("SELLER")) return null;
  return user.id;
}

/**
 * Loads a referenced listing the current actor may manage — its owning seller or
 * any admin (canManageListing). Returns `{ error }` for a caller who can't manage
 * listings at all ("Unauthorized") or a listing that does not exist, isn't theirs
 * to manage, or is not a referenced listing.
 */
async function loadOwnedReferencedListing(listingId: string) {
  const actor = await getManagerActor();
  if (!actor) return { error: "Unauthorized" as const };

  const listing = await prisma.apparelListing.findUnique({
    where: { id: listingId },
    include: { referencedVariants: true },
  });
  if (!listing || listing.sourcingMode !== "REFERENCED" || !canManageListing(actor, listing.sellerId)) {
    return { error: "Listing not found." as const };
  }
  return { listing };
}

function editPath(listingId: string) {
  return `/seller/apparel/${listingId}/edit`;
}

// ─── resolveTeemillRefAction (Step 1 preview) ─────────────────────────────────

export interface ReferencedPreview {
  title: string;
  /** Teemill's product description, cleaned to plain text for the form default. */
  description: string;
  providerBaseCurrency: string;
  providerBasePrice: number;
  colors: { colorName: string; colorHex: string }[];
  sizes: string[];
  mockups: string[];
  orderableCount: number;
}

export type ResolveResult = { error: string } | { preview: ReferencedPreview };

/**
 * Resolves a pasted Teemill ref into a preview for Step 1 of the create form.
 * Errors (unresolvable / disabled / auth) are returned so the form can re-surface
 * the "design on Teemill first, then copy the ref" guidance.
 */
export async function resolveTeemillRefAction(productRef: string): Promise<ResolveResult> {
  const sellerId = await getSellerId();
  if (!sellerId) return { error: "Unauthorized" };

  const ingest = await ingestTeemillProduct((productRef ?? "").trim());
  if (!ingest.ok) return { error: ingest.error };

  const { snapshot } = ingest;
  const mockups = [
    ...new Set(snapshot.variants.map((v) => v.mockupUrl).filter((u): u is string => Boolean(u))),
  ];
  return {
    preview: {
      title: snapshot.title,
      description: teemillDescriptionToText(snapshot.description),
      providerBaseCurrency: snapshot.providerBaseCurrency,
      providerBasePrice: snapshot.providerBasePrice,
      colors: referencedListingColors(snapshot.variants),
      sizes: referencedListingSizes(snapshot.variants),
      mockups,
      orderableCount: snapshot.variants.filter((v) => v.isOrderable).length,
    },
  };
}

// ─── createReferencedListingAction ────────────────────────────────────────────

export async function createReferencedListingAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sellerId = await getSellerId();
  if (!sellerId) return { error: "Unauthorized" };

  const providerProductRef = (formData.get("providerProductRef") as string | null)?.trim() ?? "";
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const retailPrice = parseFloat((formData.get("retailPrice") as string | null) ?? "");
  const intent = (formData.get("intent") as string | null) ?? "publish";
  const lifestyleImageUrls = formData.getAll("lifestyleImageUrl").map(String).filter(Boolean);

  if (!title) return { error: "Title is required." };
  if (!providerProductRef) {
    return {
      error:
        "Paste your Teemill product link or ref. Create the design on Teemill first, then copy its link.",
    };
  }
  if (!isFinite(retailPrice) || retailPrice < 1) {
    return { error: "Retail price must be at least $1." };
  }
  if (lifestyleImageUrls.length > MAX_LIFESTYLE_PHOTOS) {
    return { error: `You can upload at most ${MAX_LIFESTYLE_PHOTOS} lifestyle photos.` };
  }

  const ingest = await ingestTeemillProduct(providerProductRef);
  if (!ingest.ok) {
    return {
      error: `${ingest.error} Create the design on Teemill first, then copy its product link and paste it here.`,
    };
  }
  const { snapshot } = ingest;
  if (!snapshot.variants.some((v) => v.isOrderable)) {
    return { error: "That Teemill product has no orderable variants in stock right now." };
  }

  // A "draft" is UNLISTED — hidden from feeds but viewable by direct link so the
  // seller can preview it before publishing (going ACTIVE).
  const status = intent === "draft" ? "UNLISTED" : "ACTIVE";

  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      productTypeId: null,
      designImageUrl: null,
      title,
      description,
      retailPrice,
      status,
      providerKey: snapshot.providerKey,
      providerProductRef,
      images: {
        create: lifestyleImageUrls.map((originalUrl, i) => ({
          originalUrl,
          isPrimary: i === 0,
          sortOrder: i,
        })),
      },
    },
  });

  // Cache the variant snapshot + provider base price / currency / fetchedAt.
  await applyTeemillSnapshot(listing.id, snapshot);

  revalidatePath("/seller/listings");
  redirect(`/seller/apparel/${listing.id}/edit`);
}

// ─── Printify REFERENCED lane (US-MFTF-17.13) ─────────────────────────────────
// Printify is DUAL-MODE: DESIGNED (US-MFTF-17.2/17.7–17.9) and REFERENCED (this lane,
// mirroring Teemill). These actions reuse the same ReferencedPreview shape and create
// path, differing only in the ingest source (a product built in our own Printify shop,
// resolved by product_id) and USD currency.

/**
 * Resolve a pasted Printify product URL/id into a Step-1 preview. Errors are returned
 * so the form can re-surface "build the product in Printify first" guidance. USD
 * throughout (Printify quotes USD); mirrors resolveTeemillRefAction.
 */
export async function resolvePrintifyRefAction(input: string): Promise<ResolveResult> {
  const sellerId = await getSellerId();
  if (!sellerId) return { error: "Unauthorized" };

  const productId = parsePrintifyProductId(input);
  if (!productId) {
    return {
      error:
        "Paste your Printify product link or id. Build the product in Printify first, then copy its link.",
    };
  }

  const ingest = await ingestPrintifyProduct(productId);
  if (!ingest.ok) return { error: ingest.error };

  const { snapshot } = ingest;
  const mockups = [
    ...new Set(snapshot.variants.map((v) => v.mockupUrl).filter((u): u is string => Boolean(u))),
  ];
  return {
    preview: {
      title: snapshot.title,
      description: teemillDescriptionToText(snapshot.description),
      providerBaseCurrency: snapshot.providerBaseCurrency,
      providerBasePrice: snapshot.providerBasePrice,
      colors: referencedListingColors(snapshot.variants),
      sizes: referencedListingSizes(snapshot.variants),
      mockups,
      orderableCount: snapshot.variants.filter((v) => v.isOrderable).length,
    },
  };
}

/**
 * Create a REFERENCED Printify listing from a pasted product URL/id. Mirrors
 * createReferencedListingAction (Teemill): resolves + validates, creates the listing
 * with `providerKey = "printify"`, then caches the variant snapshot. The design lives
 * on the Printify product — no design file is uploaded.
 */
export async function createReferencedPrintifyListingAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sellerId = await getSellerId();
  if (!sellerId) return { error: "Unauthorized" };

  const productId = parsePrintifyProductId((formData.get("providerProductRef") as string | null) ?? "");
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const retailPrice = parseFloat((formData.get("retailPrice") as string | null) ?? "");
  const intent = (formData.get("intent") as string | null) ?? "publish";
  const lifestyleImageUrls = formData.getAll("lifestyleImageUrl").map(String).filter(Boolean);

  if (!title) return { error: "Title is required." };
  if (!productId) {
    return {
      error:
        "Paste your Printify product link or id. Build the product in Printify first, then copy its link.",
    };
  }
  if (!isFinite(retailPrice) || retailPrice < 1) {
    return { error: "Retail price must be at least $1." };
  }
  if (lifestyleImageUrls.length > MAX_LIFESTYLE_PHOTOS) {
    return { error: `You can upload at most ${MAX_LIFESTYLE_PHOTOS} lifestyle photos.` };
  }

  const ingest = await ingestPrintifyProduct(productId);
  if (!ingest.ok) {
    return {
      error: `${ingest.error} Build the product in Printify first, then copy its product link and paste it here.`,
    };
  }
  const { snapshot } = ingest;
  if (!snapshot.variants.some((v) => v.isOrderable)) {
    return { error: "That Printify product has no orderable variants in stock right now." };
  }

  const status = intent === "draft" ? "UNLISTED" : "ACTIVE";

  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      productTypeId: null,
      designImageUrl: null,
      title,
      description,
      retailPrice,
      status,
      providerKey: snapshot.providerKey,
      providerProductRef: productId,
      images: {
        create: lifestyleImageUrls.map((originalUrl, i) => ({
          originalUrl,
          isPrimary: i === 0,
          sortOrder: i,
        })),
      },
    },
  });

  await applyPrintifySnapshot(listing.id, snapshot);
  // Printify mockups bake in a white background — make them transparent so the seller's
  // background picker (US-MFTF-19.7) can composite behind them.
  await transparentizePrintifyMockups(listing.id);

  revalidatePath("/seller/listings");
  redirect(`/seller/apparel/${listing.id}/edit`);
}

// ─── updateReferencedListingAction ────────────────────────────────────────────

type UpdateResult = { error: string } | { success: true };

export async function updateReferencedListingAction(
  listingId: string,
  _prevState: UpdateResult | undefined,
  formData: FormData,
): Promise<UpdateResult> {
  const owned = await loadOwnedReferencedListing(listingId);
  if ("error" in owned && owned.error) return { error: owned.error };
  const { listing } = owned;

  if (listing.status === "SOLD") {
    return { error: "Sold listings are read-only." };
  }

  // The underlying Teemill product cannot change — that would be a new listing
  // (mirrors the designed-mode "product type cannot change" rule).
  const submittedRef = (formData.get("providerProductRef") as string | null)?.trim();
  if (submittedRef && submittedRef !== listing.providerProductRef) {
    return { error: "The Teemill product ref cannot be changed after creation." };
  }

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const retailPrice = parseFloat((formData.get("retailPrice") as string | null) ?? "");

  if (!title) return { error: "Title is required." };
  if (!isFinite(retailPrice) || retailPrice < 1) {
    return { error: "Retail price must be at least $1." };
  }

  // NOTE: the US-landed cost (US-MFTF-19.5) is intentionally NOT writable here.
  // It is an admin-set curation datum — sellers see it read-only. The write lives
  // in the admin-gated setUsLandedCostAction (src/app/actions/us-landed-cost.ts).
  await prisma.apparelListing.update({
    where: { id: listingId },
    data: { title, description, retailPrice },
  });

  revalidatePath(editPath(listingId));
  return { success: true };
}

// ─── setMockupBackgroundAction (US-MFTF-19.7) ─────────────────────────────────

type MockupBgResult = { error: string } | { success: true };

/**
 * Set (or clear) the background color for one mockup, keyed by the mockup's
 * stable identity (colorName), on a referenced listing the seller owns. The color
 * is stored as an opaque string in the ApparelListing.mockupBackgrounds JSON map —
 * any valid color value is accepted (the picker's five swatches are a UI concern
 * only). An empty value removes the key, falling back to the render-time default
 * (white). The stored mockup image is never touched — compositing is at render
 * time. Survives re-sync because the map is keyed by colorName, not variant id.
 */
export async function setMockupBackgroundAction(
  listingId: string,
  colorName: string,
  color: string,
): Promise<MockupBgResult> {
  const owned = await loadOwnedReferencedListing(listingId);
  if ("error" in owned && owned.error) return { error: owned.error };

  if (!colorName) return { error: "A mockup colour is required." };

  const current = (owned.listing.mockupBackgrounds as Record<string, string> | null) ?? {};
  const next = { ...current };
  const trimmed = color.trim();
  if (trimmed === "") {
    delete next[colorName];
  } else {
    next[colorName] = trimmed;
  }

  await prisma.apparelListing.update({
    where: { id: listingId },
    data: { mockupBackgrounds: next },
  });

  // Backgrounds show on the buyer detail page, the shop browse grid, and the
  // Discover feed — revalidate all of them, not just the seller edit page, so a
  // changed background is reflected everywhere (not just the first save).
  revalidatePath(editPath(listingId));
  revalidatePath(`/shop/${listingId}`);
  revalidatePath("/shop");
  revalidatePath("/discover");
  return { success: true };
}

// ─── resyncReferencedListingAction ────────────────────────────────────────────

type ResyncResult = { error: string } | { changes: string[] };

/** Minimal snapshot shape the diff reads — satisfied by Teemill and Printify snapshots. */
interface DiffSnapshot {
  providerBaseCurrency: string;
  providerBasePrice: number;
  variants: { variantRef: string; colorName: string; sizeLabel: string; stockLevel: number }[];
}

/** Human-readable diff between the cached snapshot and a freshly-ingested one. */
function diffSnapshot(
  oldVariants: {
    variantRef: string;
    colorName: string;
    sizeLabel: string;
    stockLevel: number;
  }[],
  oldBasePrice: number | null,
  snapshot: DiffSnapshot,
  providerName: string,
): string[] {
  const changes: string[] = [];

  if (oldBasePrice != null && oldBasePrice !== snapshot.providerBasePrice) {
    changes.push(
      `Base cost changed ${snapshot.providerBaseCurrency} ${oldBasePrice} → ${snapshot.providerBasePrice}.`,
    );
  }

  const oldByRef = new Map(oldVariants.map((v) => [v.variantRef, v]));
  const newByRef = new Map(snapshot.variants.map((v) => [v.variantRef, v]));
  const label = (v: { colorName: string; sizeLabel: string }) => `${v.colorName} (${v.sizeLabel})`;

  for (const nv of snapshot.variants) {
    const ov = oldByRef.get(nv.variantRef);
    if (!ov) {
      changes.push(`${label(nv)} was added.`);
      continue;
    }
    if (ov.stockLevel > 0 && nv.stockLevel === 0) {
      changes.push(`${label(nv)} is now out of stock.`);
    } else if (ov.stockLevel === 0 && nv.stockLevel > 0) {
      changes.push(`${label(nv)} is back in stock.`);
    }
  }

  for (const ov of oldVariants) {
    if (!newByRef.has(ov.variantRef)) {
      changes.push(`${label(ov)} is no longer available on ${providerName}.`);
    }
  }

  return changes;
}

export async function resyncReferencedListingAction(listingId: string): Promise<ResyncResult> {
  const owned = await loadOwnedReferencedListing(listingId);
  if ("error" in owned && owned.error) return { error: owned.error };
  const { listing } = owned;

  if (!listing.providerProductRef) {
    return { error: "This listing has no provider product ref to re-sync." };
  }

  // Re-run the ingest for the listing's provider (US-MFTF-17.14: Printify referenced
  // re-sync mirrors the Teemill US-MFTF-13.4 flow, differing only in the ingest source).
  const isPrintify = listing.providerKey === "printify";
  const providerName = isPrintify ? "Printify" : "Teemill";
  const ingest = isPrintify
    ? await ingestPrintifyProduct(listing.providerProductRef)
    : await ingestTeemillProduct(listing.providerProductRef);
  if (!ingest.ok) return { error: ingest.error };
  const { snapshot } = ingest;

  const changes = diffSnapshot(
    listing.referencedVariants,
    listing.providerBasePrice != null ? Number(listing.providerBasePrice) : null,
    snapshot,
    providerName,
  );

  // Keep variants that vanished from the catalog but have order history — they
  // are marked not-orderable rather than deleted (preserves order records).
  const orderedRows = await prisma.order.findMany({
    where: { apparelListingId: listingId, externalSku: { not: null } },
    select: { externalSku: true },
  });
  const preserveOrderableVariantRefs = orderedRows
    .map((o) => o.externalSku)
    .filter((s): s is string => Boolean(s));

  if (isPrintify) {
    await applyPrintifySnapshot(listingId, snapshot as PrintifyProductSnapshot, { preserveOrderableVariantRefs });
    // Re-transparentize: applyPrintifySnapshot reset mockupUrl to the raw Printify URL.
    await transparentizePrintifyMockups(listingId);
  } else {
    await applyTeemillSnapshot(listingId, snapshot as TeemillProductSnapshot, { preserveOrderableVariantRefs });
  }

  revalidatePath(editPath(listingId));
  return { changes };
}
