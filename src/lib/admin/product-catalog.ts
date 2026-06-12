import { prisma } from "@/lib/db";

export async function getAdminProductCatalog() {
  const types = await prisma.productType.findMany({
    orderBy: { name: "asc" },
    include: {
      colors: {
        select: { id: true, colorName: true, colorImageUrl: true },
        orderBy: { colorName: "asc" },
      },
      sizes: { where: { isActive: true }, select: { id: true } },
    },
  });

  return types.map((pt) => ({
    id: pt.id,
    name: pt.name,
    description: pt.description,
    fulfillmentProvider: pt.fulfillmentProvider,
    providerSkuBase: pt.providerSkuBase,
    blankImageUrl: pt.blankImageUrl,
    isActive: pt.isActive,
    activeColorCount: pt.colors.length,
    activeSizeCount: pt.sizes.length,
    // First stored color image URL — used as the catalog list thumbnail
    // without needing an extra API call.
    firstColorImageUrl: pt.colors.find((c) => c.colorImageUrl)?.colorImageUrl ?? null,
    createdAt: pt.createdAt,
    updatedAt: pt.updatedAt,
  }));
}

export type AdminProductCatalogItem = Awaited<ReturnType<typeof getAdminProductCatalog>>[number];
