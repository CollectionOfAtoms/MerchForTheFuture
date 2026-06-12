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
