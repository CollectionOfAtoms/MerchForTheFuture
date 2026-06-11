import type { PrismaClient } from "@/generated/prisma/client";

const PRODUCT_TYPES = [
  {
    name: "Unisex Tee",
    description: "GOTS-certified organic cotton unisex t-shirt",
    fulfillmentProvider: "TEEMILL" as const,
    providerSkuBase: "RNA1",
    colors: [
      { colorName: "White",        colorHex: "#FFFFFF", providerColorCode: "White" },
      { colorName: "Black",        colorHex: "#000000", providerColorCode: "Black" },
      { colorName: "Navy Blue",    colorHex: "#001F5B", providerColorCode: "Navy Blue" },
      { colorName: "Athletic Grey",colorHex: "#A9A9A9", providerColorCode: "Athletic Grey" },
    ],
    sizes: [
      { sizeLabel: "S",   providerSizeCode: "S",   sortOrder: 1 },
      { sizeLabel: "M",   providerSizeCode: "M",   sortOrder: 2 },
      { sizeLabel: "L",   providerSizeCode: "L",   sortOrder: 3 },
      { sizeLabel: "XL",  providerSizeCode: "XL",  sortOrder: 4 },
      { sizeLabel: "2XL", providerSizeCode: "2XL", sortOrder: 5 },
    ],
  },
  {
    name: "Tote Bag",
    description: "GOTS-certified organic cotton colour tote bag",
    fulfillmentProvider: "TEEMILL" as const,
    providerSkuBase: "RNT1",
    colors: [
      { colorName: "Natural", colorHex: "#F5F0E8", providerColorCode: "Natural" },
      { colorName: "White",   colorHex: "#FFFFFF",  providerColorCode: "White" },
      { colorName: "Black",   colorHex: "#000000",  providerColorCode: "Black" },
    ],
    sizes: [
      { sizeLabel: "One Size", providerSizeCode: "ONE_SIZE", sortOrder: 1 },
    ],
  },
  {
    name: "Art Print",
    description: "Giclée fine art print on premium paper via Prodigi",
    fulfillmentProvider: "PRODIGI" as const,
    providerSkuBase: "GLOBAL-FAP",
    colors: [
      { colorName: "N/A", colorHex: "#FFFFFF", providerColorCode: "N/A" },
    ],
    sizes: [
      { sizeLabel: '8"×10"',  providerSizeCode: "8X10",   sortOrder: 1 },
      { sizeLabel: '11"×14"', providerSizeCode: "11X14",  sortOrder: 2 },
      { sizeLabel: '16"×20"', providerSizeCode: "16X20",  sortOrder: 3 },
      { sizeLabel: '18"×24"', providerSizeCode: "18X24",  sortOrder: 4 },
    ],
  },
];

export async function seedProductCatalog(prisma: PrismaClient) {
  for (const pt of PRODUCT_TYPES) {
    const existing = await prisma.productType.findUnique({ where: { name: pt.name } });
    if (existing) continue;

    await prisma.productType.create({
      data: {
        name: pt.name,
        description: pt.description,
        fulfillmentProvider: pt.fulfillmentProvider,
        providerSkuBase: pt.providerSkuBase,
        colors: { create: pt.colors },
        sizes: { create: pt.sizes },
      },
    });
  }
}
