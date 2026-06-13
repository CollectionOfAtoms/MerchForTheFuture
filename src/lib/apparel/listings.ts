import { prisma } from "@/lib/db";

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
