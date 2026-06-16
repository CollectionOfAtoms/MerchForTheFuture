"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ingestTeemillProduct, applyTeemillSnapshot } from "@/lib/fulfillment/teemill";
import type { TeemillProductSnapshot } from "@/lib/fulfillment/teemill";
import {
  referencedListingColors,
  referencedListingSizes,
  teemillDescriptionToText,
} from "@/lib/apparel/referenced";

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
 * Loads a referenced listing the current seller owns. Returns `{ error }` for an
 * unauthenticated/non-seller caller ("Unauthorized") or a listing that does not
 * exist, belongs to someone else, or is not a referenced listing.
 */
async function loadOwnedReferencedListing(listingId: string) {
  const sellerId = await getSellerId();
  if (!sellerId) return { error: "Unauthorized" as const };

  const listing = await prisma.apparelListing.findUnique({
    where: { id: listingId },
    include: { referencedVariants: true },
  });
  if (!listing || listing.sellerId !== sellerId || listing.sourcingMode !== "REFERENCED") {
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

  await prisma.apparelListing.update({
    where: { id: listingId },
    data: { title, description, retailPrice },
  });

  revalidatePath(editPath(listingId));
  return { success: true };
}

// ─── resyncReferencedListingAction ────────────────────────────────────────────

type ResyncResult = { error: string } | { changes: string[] };

/** Human-readable diff between the cached snapshot and a freshly-ingested one. */
function diffSnapshot(
  oldVariants: {
    variantRef: string;
    colorName: string;
    sizeLabel: string;
    stockLevel: number;
  }[],
  oldBasePrice: number | null,
  snapshot: TeemillProductSnapshot,
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
      changes.push(`${label(ov)} is no longer available on Teemill.`);
    }
  }

  return changes;
}

export async function resyncReferencedListingAction(listingId: string): Promise<ResyncResult> {
  const owned = await loadOwnedReferencedListing(listingId);
  if ("error" in owned && owned.error) return { error: owned.error };
  const { listing } = owned;

  if (!listing.providerProductRef) {
    return { error: "This listing has no Teemill product ref to re-sync." };
  }

  const ingest = await ingestTeemillProduct(listing.providerProductRef);
  if (!ingest.ok) return { error: ingest.error };
  const { snapshot } = ingest;

  const changes = diffSnapshot(
    listing.referencedVariants,
    listing.providerBasePrice != null ? Number(listing.providerBasePrice) : null,
    snapshot,
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

  await applyTeemillSnapshot(listingId, snapshot, { preserveOrderableVariantRefs });

  revalidatePath(editPath(listingId));
  return { changes };
}
