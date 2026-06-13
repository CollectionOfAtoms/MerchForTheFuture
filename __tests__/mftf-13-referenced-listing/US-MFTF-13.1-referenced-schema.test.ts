import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { validateApparelListingInvariant } from "@/lib/apparel/invariants";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: {
      email: `seller-${crypto.randomUUID()}@test.com`,
      name: "Seller",
      roles: ["SELLER"] as never,
    },
  });
}

async function seedProductType() {
  return prisma.productType.create({
    data: {
      name: `Unisex Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "TEEMILL",
      providerSkuBase: "RNA1",
      colors: {
        create: [
          { colorName: "White", providerColorCode: "White" },
          { colorName: "Black", providerColorCode: "Black" },
        ],
      },
    },
    include: { colors: true },
  });
}

// ─── sourcingMode default + designed-mode round-trip ──────────────────────────

describe("US-MFTF-13.1 — schema: sourcingMode default + designed mode", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("defaults sourcingMode to DESIGNED so existing rows are unchanged", async () => {
    const seller = await seedSeller();
    const pt = await seedProductType();
    const listing = await prisma.apparelListing.create({
      data: {
        sellerId: seller.id,
        productTypeId: pt.id,
        title: "Solar Punk Bee",
        retailPrice: 28,
        designImageUrl: "https://blob/design.png",
      },
    });
    expect(listing.sourcingMode).toBe("DESIGNED");
    // REFERENCED-only columns are null on a designed listing.
    expect(listing.providerKey).toBeNull();
    expect(listing.providerProductRef).toBeNull();
    expect(listing.providerBaseCurrency).toBeNull();
    expect(listing.providerBasePrice).toBeNull();
    expect(listing.snapshotFetchedAt).toBeNull();
  });

  it("keeps a designed listing's color round-trip intact", async () => {
    const seller = await seedSeller();
    const pt = await seedProductType();
    const listing = await prisma.apparelListing.create({
      data: {
        sellerId: seller.id,
        productTypeId: pt.id,
        title: "Tee",
        retailPrice: 30,
        designImageUrl: "https://blob/d.png",
        colors: { create: [{ productTypeColorId: pt.colors[0].id, isOffered: true }] },
      },
      include: { colors: true, referencedVariants: true },
    });
    expect(listing.colors).toHaveLength(1);
    expect(listing.referencedVariants).toHaveLength(0);
  });
});

// ─── REFERENCED listing + ReferencedVariant round-trip ────────────────────────

describe("US-MFTF-13.1 — schema: REFERENCED listing + ReferencedVariant", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("persists a REFERENCED listing with nullable productTypeId/designImageUrl and provider fields", async () => {
    const seller = await seedSeller();
    const listing = await prisma.apparelListing.create({
      data: {
        sellerId: seller.id,
        sourcingMode: "REFERENCED",
        productTypeId: null,
        designImageUrl: null,
        title: "Powered By Plants",
        retailPrice: 32,
        providerKey: "teemill",
        providerProductRef: "https://api.teemill.com/v1/catalog/products/mock-product-uuid",
        providerBaseCurrency: "GBP",
        providerBasePrice: 21,
        snapshotFetchedAt: new Date(),
      },
    });
    expect(listing.sourcingMode).toBe("REFERENCED");
    expect(listing.productTypeId).toBeNull();
    expect(listing.designImageUrl).toBeNull();
    expect(listing.providerKey).toBe("teemill");
    expect(listing.providerBaseCurrency).toBe("GBP");
    expect(Number(listing.providerBasePrice)).toBe(21);
  });

  it("round-trips three colours × N sizes of ReferencedVariant rows including hex, stock, mockup", async () => {
    const seller = await seedSeller();
    const colours = [
      { name: "Denim Blue", hex: "#3b5b78" },
      { name: "Brown", hex: "#5a4632" },
      { name: "Evergreen", hex: "#23312d" },
    ];
    const sizes = ["S", "M", "L"];
    const listing = await prisma.apparelListing.create({
      data: {
        sellerId: seller.id,
        sourcingMode: "REFERENCED",
        title: "Powered By Plants",
        retailPrice: 32,
        providerKey: "teemill",
        providerProductRef: "ref-1",
        providerBaseCurrency: "GBP",
        providerBasePrice: 21,
        snapshotFetchedAt: new Date(),
        referencedVariants: {
          create: colours.flatMap((c) =>
            sizes.map((s) => ({
              variantRef: `https://api.teemill.com/v1/catalog/variants/${c.name}-${s}`,
              colorName: c.name,
              colorHex: c.hex,
              sizeLabel: s,
              stockLevel: 73,
              isOrderable: true,
              mockupUrl: `https://images.podos.io/${c.name}.jpg`,
            })),
          ),
        },
      },
      include: { referencedVariants: true },
    });

    expect(listing.referencedVariants).toHaveLength(9);
    const evergreenM = listing.referencedVariants.find(
      (v) => v.colorName === "Evergreen" && v.sizeLabel === "M",
    );
    expect(evergreenM).toBeDefined();
    expect(evergreenM!.colorHex).toBe("#23312d");
    expect(evergreenM!.stockLevel).toBe(73);
    expect(evergreenM!.isOrderable).toBe(true);
    expect(evergreenM!.mockupUrl).toBe("https://images.podos.io/Evergreen.jpg");
  });

  it("cascades ReferencedVariant rows when the listing is deleted", async () => {
    const seller = await seedSeller();
    const listing = await prisma.apparelListing.create({
      data: {
        sellerId: seller.id,
        sourcingMode: "REFERENCED",
        title: "Tee",
        retailPrice: 25,
        providerKey: "teemill",
        providerProductRef: "ref-2",
        referencedVariants: {
          create: [
            {
              variantRef: "https://api.teemill.com/v1/catalog/variants/x",
              colorName: "White",
              colorHex: "#ffffff",
              sizeLabel: "M",
              stockLevel: 5,
              isOrderable: true,
            },
          ],
        },
      },
    });
    await prisma.apparelListing.delete({ where: { id: listing.id } });
    const remaining = await prisma.referencedVariant.count({
      where: { apparelListingId: listing.id },
    });
    expect(remaining).toBe(0);
  });
});

// ─── Application-layer invariant ──────────────────────────────────────────────

describe("US-MFTF-13.1 — validateApparelListingInvariant", () => {
  const designed = {
    sourcingMode: "DESIGNED" as const,
    productTypeId: "pt-1",
    designImageUrl: "https://blob/d.png",
    providerKey: null,
    providerProductRef: null,
    referencedVariantCount: 0,
    apparelListingColorCount: 1,
  };
  const referenced = {
    sourcingMode: "REFERENCED" as const,
    productTypeId: null,
    designImageUrl: null,
    providerKey: "teemill",
    providerProductRef: "ref-1",
    referencedVariantCount: 3,
    apparelListingColorCount: 0,
  };

  it("accepts a well-formed DESIGNED listing", () => {
    expect(validateApparelListingInvariant(designed).valid).toBe(true);
  });

  it("accepts a well-formed REFERENCED listing", () => {
    expect(validateApparelListingInvariant(referenced).valid).toBe(true);
  });

  it("rejects a DESIGNED listing with a ReferencedVariant row", () => {
    const r = validateApparelListingInvariant({ ...designed, referencedVariantCount: 2 });
    expect(r.valid).toBe(false);
  });

  it("rejects a REFERENCED listing with an ApparelListingColor row", () => {
    const r = validateApparelListingInvariant({ ...referenced, apparelListingColorCount: 1 });
    expect(r.valid).toBe(false);
  });

  it("rejects a DESIGNED listing missing productTypeId", () => {
    const r = validateApparelListingInvariant({ ...designed, productTypeId: null });
    expect(r.valid).toBe(false);
  });

  it("rejects a DESIGNED listing missing designImageUrl", () => {
    const r = validateApparelListingInvariant({ ...designed, designImageUrl: null });
    expect(r.valid).toBe(false);
  });

  it("rejects a REFERENCED listing missing providerKey", () => {
    const r = validateApparelListingInvariant({ ...referenced, providerKey: null });
    expect(r.valid).toBe(false);
  });

  it("rejects a REFERENCED listing missing providerProductRef", () => {
    const r = validateApparelListingInvariant({ ...referenced, providerProductRef: null });
    expect(r.valid).toBe(false);
  });

  it("rejects when both productTypeId and providerProductRef are set (exactly-one rule)", () => {
    const r = validateApparelListingInvariant({
      ...referenced,
      productTypeId: "pt-1",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects when neither productTypeId nor providerProductRef is set", () => {
    const r = validateApparelListingInvariant({
      ...designed,
      productTypeId: null,
      designImageUrl: null,
    });
    expect(r.valid).toBe(false);
  });
});
