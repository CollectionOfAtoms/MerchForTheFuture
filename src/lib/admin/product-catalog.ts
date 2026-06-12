import { prisma } from "@/lib/db";

export async function getAdminProductCatalog() {
  const types = await prisma.productType.findMany({
    orderBy: { name: "asc" },
    include: {
      colors: { where: { isActive: true }, select: { id: true } },
      sizes:  { where: { isActive: true }, select: { id: true } },
    },
  });

  return types.map((pt) => ({
    id: pt.id,
    name: pt.name,
    description: pt.description,
    fulfillmentProvider: pt.fulfillmentProvider,
    providerSkuBase: pt.providerSkuBase,
    isActive: pt.isActive,
    activeColorCount: pt.colors.length,
    activeSizeCount: pt.sizes.length,
    createdAt: pt.createdAt,
    updatedAt: pt.updatedAt,
  }));
}

export type AdminProductCatalogItem = Awaited<ReturnType<typeof getAdminProductCatalog>>[number];
