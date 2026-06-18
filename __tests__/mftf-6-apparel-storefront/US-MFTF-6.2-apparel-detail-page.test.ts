import { describe, it, expect, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

const { getApparelListingDetail } = await import("@/lib/apparel/detail");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: ["SELLER"] as never },
  });
}

async function seedDesignedListing(
  sellerId: string,
  {
    status = "ACTIVE" as "ACTIVE" | "ARCHIVED" | "SOLD",
    offeredColors = ["White", "Black"],
    unofferedColors = ["Red"],
    sizes = ["S", "M", "L"],
    withImage = true,
  } = {},
) {
  const pt = await prisma.productType.create({
    data: {
      name: `Unisex Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRODIGI",
      providerSkuBase: "RNA1",
      colors: {
        create: [...offeredColors, ...unofferedColors].map((c) => ({
          colorName: c,
          providerColorCode: c,
          colorImageUrl: `https://blob/swatch-${c}.png`,
        })),
      },
      sizes: { create: sizes.map((s, i) => ({ sizeLabel: s, providerSizeCode: s, sortOrder: i + 1 })) },
    },
    include: { colors: true },
  });
  const offered = new Set(offeredColors);
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "DESIGNED",
      productTypeId: pt.id,
      title: "Solar Punk Bee",
      description: "A bee, optimistically.",
      retailPrice: 28,
      status,
      designImageUrl: "https://blob/design.png",
      colors: { create: pt.colors.map((c) => ({ productTypeColorId: c.id, isOffered: offered.has(c.colorName) })) },
      ...(withImage
        ? {
            images: {
              create: [
                { originalUrl: "https://blob/a.jpg", displayUrl: "https://blob/a-display.jpg", gridUrl: "https://blob/a-grid.jpg", isPrimary: false, sortOrder: 1 },
                { originalUrl: "https://blob/b.jpg", displayUrl: "https://blob/b-display.jpg", gridUrl: "https://blob/b-grid.jpg", isPrimary: true, sortOrder: 0 },
              ],
            },
          }
        : {}),
    },
  });
  return { pt, listing };
}

async function seedReferencedListing(
  sellerId: string,
  {
    status = "ACTIVE" as "ACTIVE" | "ARCHIVED" | "SOLD",
    colors = ["Evergreen", "Stone"],
    sizes = ["S", "M"],
    withLifestylePhoto = false,
  } = {},
) {
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      title: "Powered By Plants",
      description: "Grown, not made.",
      retailPrice: 32,
      status,
      providerKey: "teemill",
      providerProductRef: `ref-${crypto.randomUUID()}`,
      providerBaseCurrency: "GBP",
      providerBasePrice: 19,
      referencedVariants: {
        create: colors.flatMap((c) =>
          sizes.map((size) => ({
            variantRef: `https://api.teemill.com/v1/catalog/variants/${crypto.randomUUID()}`,
            colorName: c,
            colorHex: `#${c.length}${c.length}aabb`,
            sizeLabel: size,
            stockLevel: 5,
            isOrderable: true,
            mockupUrl: `https://images.podos.io/mockup-${c}.jpg`,
          })),
        ),
      },
      ...(withLifestylePhoto
        ? { images: { create: [{ originalUrl: "https://blob/ref.jpg", displayUrl: "https://blob/ref-display.jpg", isPrimary: true, sortOrder: 0 }] } }
        : {}),
    },
  });
  return { listing };
}

// ─── US-MFTF-6.2 — getApparelListingDetail ─────────────────────────────────────

describe("getApparelListingDetail", () => {
  afterEach(async () => { await resetDatabase(); });

  it("returns null for a non-existent listing", async () => {
    expect(await getApparelListingDetail("does-not-exist")).toBeNull();
  });

  it("returns null for an ARCHIVED listing", async () => {
    const seller = await seedSeller();
    const { listing } = await seedDesignedListing(seller.id, { status: "ARCHIVED" });
    expect(await getApparelListingDetail(listing.id)).toBeNull();
  });

  it("returns null for a SOLD listing", async () => {
    const seller = await seedSeller();
    const { listing } = await seedReferencedListing(seller.id, { status: "SOLD" });
    expect(await getApparelListingDetail(listing.id)).toBeNull();
  });

  // ── Designed mode ──
  it("returns title, description, and USD retail price for a designed listing", async () => {
    const seller = await seedSeller();
    const { listing } = await seedDesignedListing(seller.id);
    const detail = await getApparelListingDetail(listing.id);
    expect(detail).toMatchObject({
      id: listing.id,
      title: "Solar Punk Bee",
      description: "A bee, optimistically.",
      retailPrice: 28,
    });
  });

  it("projects only offered designed colours as swatches (name + swatch image + derived hex)", async () => {
    const seller = await seedSeller();
    const { listing } = await seedDesignedListing(seller.id, { offeredColors: ["White", "Black"], unofferedColors: ["Red"] });
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.colors.map((c) => c.name).sort()).toEqual(["Black", "White"]);
    const white = detail!.colors.find((c) => c.name === "White")!;
    // Provider gives names only; we derive an approximate hex so swatches render.
    expect(white.hex).toBe("#ffffff");
    expect(white.swatchImageUrl).toBe("https://blob/swatch-White.png");
  });

  it("returns all product-type sizes for a designed listing, ordered by sortOrder", async () => {
    const seller = await seedSeller();
    const { listing } = await seedDesignedListing(seller.id, { sizes: ["S", "M", "L"] });
    const detail = await getApparelListingDetail(listing.id);
    // Read returns product-type sizes ordered by sortOrder (S=1, M=2, L=3).
    expect(detail!.sizes).toEqual(["S", "M", "L"]);
  });

  it("orders designed images primary-first, using the display variant", async () => {
    const seller = await seedSeller();
    const { listing } = await seedDesignedListing(seller.id);
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.images.map((i) => i.url)).toEqual(["https://blob/b-display.jpg", "https://blob/a-display.jpg"]);
  });

  // ── Referenced mode ──
  it("projects distinct referenced colours as swatches with hex", async () => {
    const seller = await seedSeller();
    const { listing } = await seedReferencedListing(seller.id, { colors: ["Evergreen", "Stone"] });
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.colors.map((c) => c.name)).toEqual(["Evergreen", "Stone"]);
    expect(detail!.colors.every((c) => /^#[0-9a-f]+$/i.test(c.hex ?? ""))).toBe(true);
  });

  it("returns distinct referenced sizes", async () => {
    const seller = await seedSeller();
    const { listing } = await seedReferencedListing(seller.id, { colors: ["Evergreen", "Stone"], sizes: ["S", "M"] });
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.sizes).toEqual(["S", "M"]);
  });

  it("uses cached Teemill mockups for a referenced listing without lifestyle photos", async () => {
    const seller = await seedSeller();
    const { listing } = await seedReferencedListing(seller.id, { colors: ["Evergreen", "Stone"], withLifestylePhoto: false });
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.images.map((i) => i.url)).toEqual([
      "https://images.podos.io/mockup-Evergreen.jpg",
      "https://images.podos.io/mockup-Stone.jpg",
    ]);
  });

  it("prefers uploaded lifestyle photos over mockups for a referenced listing", async () => {
    const seller = await seedSeller();
    const { listing } = await seedReferencedListing(seller.id, { withLifestylePhoto: true });
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.images[0].url).toBe("https://blob/ref-display.jpg");
  });

  it("never leaks provider name, base price, currency, or sourcingMode for referenced listings", async () => {
    const seller = await seedSeller();
    const { listing } = await seedReferencedListing(seller.id);
    const detail = await getApparelListingDetail(listing.id);
    const json = JSON.stringify(detail);
    expect(json).not.toMatch(/teemill/i);
    expect(json).not.toMatch(/GBP/);
    expect(json).not.toMatch(/providerBasePrice|sourcingMode|REFERENCED/);
  });
});
