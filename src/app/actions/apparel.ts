"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type ActionResult = { error: string } | undefined;
type MutationResult = { error: string } | { success: true; imageId?: string };

const MAX_LIFESTYLE_PHOTOS = 10;
const BLOB_TOKEN =
  process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

/** Returns the seller's user id, or null if the caller is not a signed-in seller. */
async function getSellerId(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id || !user.roles?.includes("SELLER")) return null;
  return user.id;
}

/**
 * Loads an apparel listing the current seller owns. Returns `{ error }` for an
 * unauthenticated/non-seller caller ("Unauthorized") or a listing that does not
 * exist or belongs to someone else ("Listing not found.").
 */
async function loadOwnedListing(listingId: string) {
  const sellerId = await getSellerId();
  if (!sellerId) return { error: "Unauthorized" as const };

  const listing = await prisma.apparelListing.findUnique({
    where: { id: listingId },
    include: { productType: { include: { colors: { select: { id: true } } } } },
  });
  if (!listing || listing.sellerId !== sellerId) {
    return { error: "Listing not found." as const };
  }
  return { listing };
}

function editPath(listingId: string) {
  return `/seller/apparel/${listingId}/edit`;
}

// ─── createApparelListingAction ───────────────────────────────────────────────

export async function createApparelListingAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sellerId = await getSellerId();
  if (!sellerId) return { error: "Unauthorized" };

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const productTypeId = (formData.get("productTypeId") as string | null)?.trim() ?? "";
  const designImageUrl = (formData.get("designImageUrl") as string | null)?.trim() ?? "";
  const retailPrice = parseFloat((formData.get("retailPrice") as string | null) ?? "");
  const intent = (formData.get("intent") as string | null) ?? "publish";
  const offeredColorIds = formData.getAll("offeredColorId").map(String).filter(Boolean);
  const lifestyleImageUrls = formData.getAll("lifestyleImageUrl").map(String).filter(Boolean);

  if (!title) return { error: "Title is required." };
  if (!productTypeId) return { error: "Please select a product type." };

  const productType = await prisma.productType.findUnique({
    where: { id: productTypeId },
    include: { colors: { select: { id: true } } },
  });
  if (!productType || !productType.isActive) {
    return { error: "Please select a valid product type." };
  }

  if (!designImageUrl) return { error: "A design file is required." };
  if (!isFinite(retailPrice) || retailPrice < 1) {
    return { error: "Retail price must be at least $1." };
  }
  if (offeredColorIds.length === 0) {
    return { error: "Select at least one color to offer." };
  }

  const validColorIds = new Set(productType.colors.map((c) => c.id));
  if (!offeredColorIds.every((id) => validColorIds.has(id))) {
    return { error: "Invalid color selection." };
  }
  if (lifestyleImageUrls.length > MAX_LIFESTYLE_PHOTOS) {
    return { error: `You can upload at most ${MAX_LIFESTYLE_PHOTOS} lifestyle photos.` };
  }

  const status = intent === "draft" ? "ARCHIVED" : "ACTIVE";

  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      productTypeId,
      title,
      description,
      retailPrice,
      status,
      designImageUrl,
      colors: {
        create: offeredColorIds.map((productTypeColorId) => ({
          productTypeColorId,
          isOffered: true,
        })),
      },
      images: {
        create: lifestyleImageUrls.map((originalUrl, i) => ({
          originalUrl,
          isPrimary: i === 0,
          sortOrder: i,
        })),
      },
    },
  });

  revalidatePath("/seller/listings");
  // Redirect to the edit page so the seller can review the listing and the
  // lifestyle-photo variants get generated client-side. The public storefront
  // page (/shop/[id]) arrives in Epic MFTF-6.
  redirect(`/seller/apparel/${listing.id}/edit`);
}

// ─── updateApparelListingAction ───────────────────────────────────────────────

export async function updateApparelListingAction(
  listingId: string,
  _prevState: { error: string } | { success: true } | undefined,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const owned = await loadOwnedListing(listingId);
  if ("error" in owned && owned.error) return { error: owned.error };
  const { listing } = owned;

  if (listing.status === "SOLD") {
    return { error: "Sold listings are read-only." };
  }

  // The product type is fixed at creation — changing it would invalidate the
  // color selections and the design file.
  const submittedProductTypeId = (formData.get("productTypeId") as string | null)?.trim();
  if (submittedProductTypeId && submittedProductTypeId !== listing.productTypeId) {
    return { error: "Product type cannot be changed after creation." };
  }

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;
  const retailPrice = parseFloat((formData.get("retailPrice") as string | null) ?? "");
  const offeredColorIds = formData.getAll("offeredColorId").map(String).filter(Boolean);

  if (!title) return { error: "Title is required." };
  if (!isFinite(retailPrice) || retailPrice < 1) {
    return { error: "Retail price must be at least $1." };
  }
  if (offeredColorIds.length === 0) {
    return { error: "At least one color must remain offered." };
  }

  const validColorIds = new Set(listing.productType?.colors.map((c) => c.id) ?? []);
  if (!offeredColorIds.every((id) => validColorIds.has(id))) {
    return { error: "Invalid color selection." };
  }

  await prisma.$transaction([
    prisma.apparelListing.update({
      where: { id: listingId },
      data: { title, description, retailPrice },
    }),
    // Drop colors that are no longer offered…
    prisma.apparelListingColor.deleteMany({
      where: { apparelListingId: listingId, productTypeColorId: { notIn: offeredColorIds } },
    }),
    // …and (re)assert the offered ones.
    ...offeredColorIds.map((productTypeColorId) =>
      prisma.apparelListingColor.upsert({
        where: { apparelListingId_productTypeColorId: { apparelListingId: listingId, productTypeColorId } },
        create: { apparelListingId: listingId, productTypeColorId, isOffered: true },
        update: { isOffered: true },
      }),
    ),
  ]);

  revalidatePath(editPath(listingId));
  return { success: true };
}

// ─── addApparelImageAction ────────────────────────────────────────────────────

/** Appends a lifestyle photo (originalUrl). Variants are generated separately. */
export async function addApparelImageAction(
  listingId: string,
  originalUrl: string,
): Promise<MutationResult> {
  const owned = await loadOwnedListing(listingId);
  if ("error" in owned && owned.error) return { error: owned.error };

  const count = await prisma.apparelListingImage.count({ where: { apparelListingId: listingId } });
  const image = await prisma.apparelListingImage.create({
    data: { apparelListingId: listingId, originalUrl, isPrimary: count === 0, sortOrder: count },
  });

  revalidatePath(editPath(listingId));
  return { success: true, imageId: image.id };
}

// ─── deleteApparelImageAction ─────────────────────────────────────────────────

export async function deleteApparelImageAction(
  listingId: string,
  imageId: string,
): Promise<MutationResult> {
  const owned = await loadOwnedListing(listingId);
  if ("error" in owned && owned.error) return { error: owned.error };

  const image = await prisma.apparelListingImage.findUnique({ where: { id: imageId } });
  if (!image || image.apparelListingId !== listingId) return { error: "Image not found." };

  await del(image.originalUrl, { token: BLOB_TOKEN }).catch(() => {});
  await prisma.apparelListingImage.delete({ where: { id: imageId } });

  // If the primary was removed, promote the first remaining photo.
  if (image.isPrimary) {
    const next = await prisma.apparelListingImage.findFirst({
      where: { apparelListingId: listingId },
      orderBy: { sortOrder: "asc" },
    });
    if (next) {
      await prisma.apparelListingImage.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }

  revalidatePath(editPath(listingId));
  return { success: true };
}

// ─── setApparelPrimaryImageAction ─────────────────────────────────────────────

export async function setApparelPrimaryImageAction(
  listingId: string,
  imageId: string,
): Promise<MutationResult> {
  const owned = await loadOwnedListing(listingId);
  if ("error" in owned && owned.error) return { error: owned.error };

  const image = await prisma.apparelListingImage.findUnique({ where: { id: imageId } });
  if (!image || image.apparelListingId !== listingId) return { error: "Image not found." };

  await prisma.$transaction([
    prisma.apparelListingImage.updateMany({
      where: { apparelListingId: listingId },
      data: { isPrimary: false },
    }),
    prisma.apparelListingImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
  ]);

  revalidatePath(editPath(listingId));
  return { success: true };
}

// ─── toggleApparelListingStatusAction ─────────────────────────────────────────

/** Archive an active apparel listing, or reactivate an archived one. No-op on SOLD. */
export async function toggleApparelListingStatusAction(listingId: string): Promise<void> {
  const owned = await loadOwnedListing(listingId);
  if ("error" in owned && owned.error) return;
  const { listing } = owned;
  if (listing.status === "SOLD") return;

  const next = listing.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
  await prisma.apparelListing.update({ where: { id: listingId }, data: { status: next } });
  revalidatePath("/seller/listings");
}

// ─── deleteApparelListingAction ───────────────────────────────────────────────

/** Permanently delete an apparel listing (and its blobs). Refused on SOLD listings. */
export async function deleteApparelListingAction(listingId: string): Promise<MutationResult> {
  const owned = await loadOwnedListing(listingId);
  if ("error" in owned && owned.error) return { error: owned.error };
  const { listing } = owned;
  if (listing.status === "SOLD") return { error: "Cannot delete a sold listing." };

  const images = await prisma.apparelListingImage.findMany({ where: { apparelListingId: listingId } });
  const urls = [
    listing.designImageUrl,
    ...images.flatMap((i) => [i.originalUrl, i.displayUrl, i.gridUrl, i.thumbnailUrl]),
  ].filter((u): u is string => Boolean(u));
  if (urls.length > 0) {
    await del(urls, { token: BLOB_TOKEN }).catch(() => {});
  }

  // ApparelListingColor / ApparelListingImage rows cascade on delete.
  await prisma.apparelListing.delete({ where: { id: listingId } });

  revalidatePath("/seller/listings");
  return { success: true };
}

// ─── replaceApparelDesignAction ───────────────────────────────────────────────

/** Swaps the clean design file. Lifestyle photos are untouched. */
export async function replaceApparelDesignAction(
  listingId: string,
  designImageUrl: string,
): Promise<MutationResult> {
  const owned = await loadOwnedListing(listingId);
  if ("error" in owned && owned.error) return { error: owned.error };

  if (!designImageUrl?.trim()) return { error: "A design file is required." };

  await prisma.apparelListing.update({
    where: { id: listingId },
    data: { designImageUrl },
  });

  revalidatePath(editPath(listingId));
  return { success: true };
}
