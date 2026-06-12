import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── US-MFTF-4.1 — Product Type Schema ───────────────────────────────────────

describe("US-MFTF-4.1 — ProductType model", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it("creates a ProductType with all required fields and correct defaults", async () => {
    const pt = await prisma.productType.create({
      data: {
        name: "Unisex Tee",
        fulfillmentProvider: "TEEMILL",
        providerSkuBase: "RNA1",
      },
    });

    expect(pt.id).toBeDefined();
    expect(pt.name).toBe("Unisex Tee");
    expect(pt.fulfillmentProvider).toBe("TEEMILL");
    expect(pt.providerSkuBase).toBe("RNA1");
    expect(pt.isActive).toBe(true);
    expect(pt.description).toBeNull();
    expect(pt.createdAt).toBeInstanceOf(Date);
    expect(pt.updatedAt).toBeInstanceOf(Date);
  });

  it("creates a ProductType with PRODIGI as fulfillment provider", async () => {
    const pt = await prisma.productType.create({
      data: {
        name: "Art Print",
        fulfillmentProvider: "PRODIGI",
        providerSkuBase: "GLOBAL-FAP-16X20",
      },
    });

    expect(pt.fulfillmentProvider).toBe("PRODIGI");
  });

  it("creates a ProductType with optional description and isActive=false", async () => {
    const pt = await prisma.productType.create({
      data: {
        name: "Tote Bag",
        description: "Organic cotton tote",
        fulfillmentProvider: "TEEMILL",
        providerSkuBase: "RNT1",
        isActive: false,
      },
    });

    expect(pt.description).toBe("Organic cotton tote");
    expect(pt.isActive).toBe(false);
  });

  it("enforces unique product type names", async () => {
    await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });

    await expect(
      prisma.productType.create({
        data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
      })
    ).rejects.toThrow();
  });
});

describe("US-MFTF-4.1 — ProductTypeColor model", () => {
  let productTypeId: string;

  beforeEach(async () => {
    const pt = await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    productTypeId = pt.id;
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("creates a color associated with a product type", async () => {
    const color = await prisma.productTypeColor.create({
      data: {
        productTypeId,
        colorName: "White",
        colorHex: "#FFFFFF",
        providerColorCode: "White",
      },
    });

    expect(color.id).toBeDefined();
    expect(color.productTypeId).toBe(productTypeId);
    expect(color.colorName).toBe("White");
    expect(color.colorHex).toBe("#FFFFFF");
    expect(color.providerColorCode).toBe("White");
    expect(color.isActive).toBe(true);
  });

  it("creates multiple colors for a product type", async () => {
    await prisma.productTypeColor.createMany({
      data: [
        { productTypeId, colorName: "White", colorHex: "#FFFFFF", providerColorCode: "White" },
        { productTypeId, colorName: "Black", colorHex: "#000000", providerColorCode: "Black" },
        { productTypeId, colorName: "Navy Blue", colorHex: "#003366", providerColorCode: "Navy Blue" },
      ],
    });

    const colors = await prisma.productTypeColor.findMany({ where: { productTypeId } });
    expect(colors).toHaveLength(3);
  });

  it("cascades delete when product type is deleted", async () => {
    await prisma.productTypeColor.create({
      data: { productTypeId, colorName: "White", colorHex: "#FFFFFF", providerColorCode: "White" },
    });

    await prisma.productType.delete({ where: { id: productTypeId } });

    const colors = await prisma.productTypeColor.findMany({ where: { productTypeId } });
    expect(colors).toHaveLength(0);
  });

  it("can be set inactive independently", async () => {
    const color = await prisma.productTypeColor.create({
      data: { productTypeId, colorName: "White", colorHex: "#FFFFFF", providerColorCode: "White", isActive: false },
    });

    expect(color.isActive).toBe(false);
  });
});

describe("US-MFTF-4.1 — ProductTypeSizeOption model", () => {
  let productTypeId: string;

  beforeEach(async () => {
    const pt = await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    productTypeId = pt.id;
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("creates a size option associated with a product type", async () => {
    const size = await prisma.productTypeSizeOption.create({
      data: {
        productTypeId,
        sizeLabel: "M",
        providerSizeCode: "M",
        sortOrder: 2,
      },
    });

    expect(size.id).toBeDefined();
    expect(size.productTypeId).toBe(productTypeId);
    expect(size.sizeLabel).toBe("M");
    expect(size.providerSizeCode).toBe("M");
    expect(size.sortOrder).toBe(2);
    expect(size.isActive).toBe(true);
  });

  it("creates a full size run in sort order", async () => {
    await prisma.productTypeSizeOption.createMany({
      data: [
        { productTypeId, sizeLabel: "S",   providerSizeCode: "S",   sortOrder: 1 },
        { productTypeId, sizeLabel: "M",   providerSizeCode: "M",   sortOrder: 2 },
        { productTypeId, sizeLabel: "L",   providerSizeCode: "L",   sortOrder: 3 },
        { productTypeId, sizeLabel: "XL",  providerSizeCode: "XL",  sortOrder: 4 },
        { productTypeId, sizeLabel: "2XL", providerSizeCode: "2XL", sortOrder: 5 },
      ],
    });

    const sizes = await prisma.productTypeSizeOption.findMany({
      where: { productTypeId },
      orderBy: { sortOrder: "asc" },
    });
    expect(sizes.map((s) => s.sizeLabel)).toEqual(["S", "M", "L", "XL", "2XL"]);
  });

  it("cascades delete when product type is deleted", async () => {
    await prisma.productTypeSizeOption.create({
      data: { productTypeId, sizeLabel: "M", providerSizeCode: "M", sortOrder: 2 },
    });

    await prisma.productType.delete({ where: { id: productTypeId } });

    const sizes = await prisma.productTypeSizeOption.findMany({ where: { productTypeId } });
    expect(sizes).toHaveLength(0);
  });
});

describe("US-MFTF-4.1 — Full round-trip with includes", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it("queries a ProductType with its colors and sizes in one call", async () => {
    const pt = await prisma.productType.create({
      data: {
        name: "Unisex Tee",
        fulfillmentProvider: "TEEMILL",
        providerSkuBase: "RNA1",
        colors: {
          create: [
            { colorName: "White", colorHex: "#FFFFFF", providerColorCode: "White" },
            { colorName: "Black", colorHex: "#000000", providerColorCode: "Black" },
          ],
        },
        sizes: {
          create: [
            { sizeLabel: "S", providerSizeCode: "S", sortOrder: 1 },
            { sizeLabel: "M", providerSizeCode: "M", sortOrder: 2 },
          ],
        },
      },
      include: { colors: true, sizes: { orderBy: { sortOrder: "asc" } } },
    });

    expect(pt.colors).toHaveLength(2);
    expect(pt.sizes).toHaveLength(2);
    expect(pt.sizes[0].sizeLabel).toBe("S");
    expect(pt.sizes[1].sizeLabel).toBe("M");
  });
});

describe("US-MFTF-4.1 — Seed file", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it("runs without error and creates at least one product type with colors and sizes", async () => {
    const { seedProductCatalog } = await import("../../prisma/seed-product-catalog");
    await seedProductCatalog(prisma);

    const types = await prisma.productType.findMany({
      include: { colors: true, sizes: true },
    });

    expect(types.length).toBeGreaterThanOrEqual(1);
    expect(types[0].colors.length).toBeGreaterThanOrEqual(1);
    expect(types[0].sizes.length).toBeGreaterThanOrEqual(1);
  });

  it("seed is idempotent — running twice does not throw or duplicate", async () => {
    const { seedProductCatalog } = await import("../../prisma/seed-product-catalog");
    await seedProductCatalog(prisma);
    await expect(seedProductCatalog(prisma)).resolves.not.toThrow();

    const types = await prisma.productType.findMany();
    const names = types.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});
