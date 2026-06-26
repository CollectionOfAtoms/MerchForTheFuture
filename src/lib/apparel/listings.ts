import { prisma } from "@/lib/db";
import { teemillEditUrl } from "@/lib/fulfillment/teemill";
import {
  referencedListingColors,
  referencedListingSizes,
  referencedListingCarousel,
} from "@/lib/apparel/referenced";

/**
 * Active product types available for a seller to build an apparel listing from.
 *
 * Seller-facing only: dropshipper details (`fulfillmentProvider`,
 * `providerSkuBase`, `providerColorCode`) are deliberately excluded — sellers
 * see the curated product name, the color name + swatch image, and the size
 * labels, never which dropshipper or SKU backs the product.
 */
export async function getActiveProductTypesForListing() {
  const types = await prisma.productType.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      colors: {
        select: { id: true, colorName: true, colorImageUrl: true },
        orderBy: { colorName: "asc" },
      },
      sizes: {
        select: { id: true, sizeLabel: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return types.map((pt) => ({
    id: pt.id,
    name: pt.name,
    description: pt.description,
    colors: pt.colors.map((c) => ({
      id: c.id,
      colorName: c.colorName,
      colorImageUrl: c.colorImageUrl,
    })),
    sizes: pt.sizes.map((s) => ({ id: s.id, sizeLabel: s.sizeLabel, sortOrder: s.sortOrder })),
  }));
}

export type ApparelProductTypeOption = Awaited<
  ReturnType<typeof getActiveProductTypesForListing>
>[number];

/**
 * Full editable state of a single apparel listing: every color of its product
 * type flagged offered/not, lifestyle photos in order, and the clean design
 * file. Returns null when the listing does not exist. Ownership is enforced by
 * the caller (the edit page / actions) — this is a pure read.
 */
export async function getApparelListingForEdit(listingId: string) {
  const listing = await prisma.apparelListing.findUnique({
    where: { id: listingId },
    include: {
      productType: {
        include: {
          colors: { orderBy: { colorName: "asc" } },
          sizes: { orderBy: { sortOrder: "asc" } },
        },
      },
      colors: true,
      images: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!listing) return null;

  const offeredSet = new Set(
    listing.colors.filter((c) => c.isOffered).map((c) => c.productTypeColorId),
  );

  return {
    id: listing.id,
    sellerId: listing.sellerId,
    title: listing.title,
    description: listing.description,
    retailPrice: Number(listing.retailPrice),
    status: listing.status,
    designImageUrl: listing.designImageUrl,
    // Designed listings always have a product type; referenced listings (handled
    // by the 13.4 edit path) do not, so guard for null to stay type-safe.
    productType: {
      id: listing.productType?.id ?? "",
      name: listing.productType?.name ?? "",
      sizes: (listing.productType?.sizes ?? []).map((s) => ({ id: s.id, sizeLabel: s.sizeLabel })),
    },
    colors: (listing.productType?.colors ?? []).map((c) => ({
      productTypeColorId: c.id,
      colorName: c.colorName,
      colorImageUrl: c.colorImageUrl,
      isOffered: offeredSet.has(c.id),
    })),
    images: listing.images.map((i) => ({
      id: i.id,
      originalUrl: i.originalUrl,
      displayUrl: i.displayUrl,
      gridUrl: i.gridUrl,
      thumbnailUrl: i.thumbnailUrl,
      isPrimary: i.isPrimary,
      sortOrder: i.sortOrder,
    })),
  };
}

export type ApparelListingEditData = NonNullable<
  Awaited<ReturnType<typeof getApparelListingForEdit>>
>;

/**
 * Editable state of a REFERENCED (Teemill) apparel listing: editable merchandising
 * (title/description/retailPrice/status/photos) plus the read-only, provider-owned
 * snapshot (colours+hex, sizes, per-variant stock) and an "Edit on Teemill" link.
 * Returns null when the listing does not exist or is not a referenced listing
 * (the designed path uses `getApparelListingForEdit`). Ownership is enforced by
 * the caller.
 */
export async function getReferencedListingForEdit(listingId: string) {
  const listing = await prisma.apparelListing.findUnique({
    where: { id: listingId },
    include: {
      referencedVariants: { orderBy: [{ colorName: "asc" }, { sizeLabel: "asc" }] },
      images: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!listing || listing.sourcingMode !== "REFERENCED") return null;

  return {
    id: listing.id,
    sellerId: listing.sellerId,
    title: listing.title,
    description: listing.description,
    retailPrice: Number(listing.retailPrice),
    status: listing.status,
    sourcingMode: listing.sourcingMode,
    providerKey: listing.providerKey,
    providerProductRef: listing.providerProductRef,
    providerBaseCurrency: listing.providerBaseCurrency,
    providerBasePrice: listing.providerBasePrice != null ? Number(listing.providerBasePrice) : null,
    usLandedCost: listing.usLandedCost,
    snapshotFetchedAt: listing.snapshotFetchedAt,
    colors: referencedListingColors(listing.referencedVariants),
    sizes: referencedListingSizes(listing.referencedVariants),
    // Edit carousel: uploaded lifestyle photos first (the primary photo leads,
    // then the rest in sort order), then the Teemill mockups.
    carouselImages: referencedListingCarousel({
      lifestyle: [...listing.images].sort(
        (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
      ),
      variants: listing.referencedVariants,
    }),
    variants: listing.referencedVariants.map((v) => ({
      variantRef: v.variantRef,
      colorName: v.colorName,
      colorHex: v.colorHex,
      sizeLabel: v.sizeLabel,
      stockLevel: v.stockLevel,
      isOrderable: v.isOrderable,
      mockupUrl: v.mockupUrl,
    })),
    images: listing.images.map((i) => ({
      id: i.id,
      originalUrl: i.originalUrl,
      displayUrl: i.displayUrl,
      gridUrl: i.gridUrl,
      thumbnailUrl: i.thumbnailUrl,
      isPrimary: i.isPrimary,
      sortOrder: i.sortOrder,
    })),
    editOnTeemillUrl: teemillEditUrl({
      slug: listing.providerProductSlug,
      ref: listing.providerProductRef,
    }),
  };
}

export type ReferencedListingEditData = NonNullable<
  Awaited<ReturnType<typeof getReferencedListingForEdit>>
>;
