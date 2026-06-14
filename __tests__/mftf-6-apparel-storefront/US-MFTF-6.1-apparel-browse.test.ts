import { describe, it, expect, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

const { getApparelListings } = await import("@/lib/apparel/browse");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: ["SELLER"] as never },
  });
}

/** A DESIGNED (Prodigi) apparel listing with offered colours and a lifestyle photo. */
async function seedDesignedListing(
  sellerId: string,
  {
    title = "Solar Punk Bee",
    status = "ACTIVE" as "ACTIVE" | "ARCHIVED" | "SOLD",
    retailPrice = 28,
    offeredColors = ["White", "Black"],
    unofferedColors = [] as string[],
    createdAt,
    withImage = true,
  }: {
    title?: string;
    status?: "ACTIVE" | "ARCHIVED" | "SOLD";
    retailPrice?: number;
    offeredColors?: string[];
    unofferedColors?: string[];
    createdAt?: Date;
    withImage?: boolean;
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
      sizes: { create: [{ sizeLabel: "M", providerSizeCode: "M", sortOrder: 1 }] },
    },
    include: { colors: true },
  });
  const offered = new Set(offeredColors);
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "DESIGNED",
      productTypeId: pt.id,
      title,
      retailPrice,
      status,
      designImageUrl: "https://blob/design.png",
      colors: {
        create: pt.colors.map((c) => ({ productTypeColorId: c.id, isOffered: offered.has(c.colorName) })),
      },
      ...(createdAt ? { createdAt } : {}),
      ...(withImage
        ? {
            images: {
              create: [
                {
                  originalUrl: "https://blob/ls.jpg",
                  displayUrl: "https://blob/ls-display.jpg",
                  gridUrl: "https://blob/ls-grid.jpg",
                  thumbnailUrl: "https://blob/ls-thumb.jpg",
                  isPrimary: true,
                  sortOrder: 0,
                },
              ],
            },
          }
        : {}),
    },
  });
  return { pt, listing };
}

/** A REFERENCED (Teemill) apparel listing whose colours/sizes/mockups live in the snapshot. */
async function seedReferencedListing(
  sellerId: string,
  {
    title = "Powered By Plants",
    status = "ACTIVE" as "ACTIVE" | "ARCHIVED" | "SOLD",
    retailPrice = 32,
    colors = ["Evergreen", "Stone", "Black"],
    createdAt,
    withLifestylePhoto = false,
  }: {
    title?: string;
    status?: "ACTIVE" | "ARCHIVED" | "SOLD";
    retailPrice?: number;
    colors?: string[];
    createdAt?: Date;
    withLifestylePhoto?: boolean;
  } = {},
) {
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      title,
      retailPrice,
      status,
      providerKey: "teemill",
      providerProductRef: `ref-${crypto.randomUUID()}`,
      providerBaseCurrency: "GBP",
      providerBasePrice: 19,
      ...(createdAt ? { createdAt } : {}),
      referencedVariants: {
        // Two sizes per colour, so distinct-colour logic is exercised.
        create: colors.flatMap((c) =>
          ["S", "M"].map((size) => ({
            variantRef: `https://api.teemill.com/v1/catalog/variants/${crypto.randomUUID()}`,
            colorName: c,
            colorHex: "#123456",
            sizeLabel: size,
            stockLevel: 10,
            isOrderable: true,
            mockupUrl: `https://images.podos.io/mockup-${c}.jpg`,
          })),
        ),
      },
      ...(withLifestylePhoto
        ? {
            images: {
              create: [
                {
                  originalUrl: "https://blob/ref-ls.jpg",
                  displayUrl: "https://blob/ref-ls-display.jpg",
                  gridUrl: "https://blob/ref-ls-grid.jpg",
                  thumbnailUrl: "https://blob/ref-ls-thumb.jpg",
                  isPrimary: true,
                  sortOrder: 0,
                },
              ],
            },
          }
        : {}),
    },
  });
  return { listing };
}

// ─── US-MFTF-6.1 — getApparelListings (browse read) ────────────────────────────

describe("getApparelListings — active-only, newest-first", () => {
  afterEach(async () => { await resetDatabase(); });

  it("returns an empty page when there are no listings", async () => {
    const result = await getApparelListings();
    expect(result.listings).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it("returns ACTIVE designed and referenced listings together", async () => {
    const seller = await seedSeller();
    await seedDesignedListing(seller.id, { title: "Designed Tee" });
    await seedReferencedListing(seller.id, { title: "Referenced Tee" });
    const { listings, total } = await getApparelListings();
    expect(total).toBe(2);
    expect(listings.map((l) => l.title).sort()).toEqual(["Designed Tee", "Referenced Tee"]);
  });

  it("excludes ARCHIVED and SOLD listings", async () => {
    const seller = await seedSeller();
    await seedDesignedListing(seller.id, { title: "Active", status: "ACTIVE" });
    await seedDesignedListing(seller.id, { title: "Archived", status: "ARCHIVED" });
    await seedReferencedListing(seller.id, { title: "Sold", status: "SOLD" });
    const { listings, total } = await getApparelListings();
    expect(total).toBe(1);
    expect(listings[0].title).toBe("Active");
  });

  it("sorts by createdAt descending (newest first)", async () => {
    const seller = await seedSeller();
    await seedDesignedListing(seller.id, { title: "Oldest", createdAt: new Date("2026-06-01T00:00:00Z") });
    await seedReferencedListing(seller.id, { title: "Middle", createdAt: new Date("2026-06-05T00:00:00Z") });
    await seedDesignedListing(seller.id, { title: "Newest", createdAt: new Date("2026-06-10T00:00:00Z") });
    const { listings } = await getApparelListings();
    expect(listings.map((l) => l.title)).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("reports the offered-colour count for a designed listing", async () => {
    const seller = await seedSeller();
    await seedDesignedListing(seller.id, { offeredColors: ["White", "Black"], unofferedColors: ["Red"] });
    const { listings } = await getApparelListings();
    // Only the two offered colours count — the unoffered one is excluded.
    expect(listings[0].colorCount).toBe(2);
  });

  it("reports the distinct-colour count for a referenced listing", async () => {
    const seller = await seedSeller();
    await seedReferencedListing(seller.id, { colors: ["Evergreen", "Stone", "Black"] });
    const { listings } = await getApparelListings();
    // Three colours × two sizes = six variants, but only three distinct colours.
    expect(listings[0].colorCount).toBe(3);
  });

  it("exposes the USD retail price and a stable detail-page id", async () => {
    const seller = await seedSeller();
    const { listing } = await seedReferencedListing(seller.id, { retailPrice: 32 });
    const { listings } = await getApparelListings();
    expect(listings[0]).toMatchObject({ id: listing.id, retailPrice: 32 });
  });

  it("uses the primary lifestyle photo's grid variant for a designed tile", async () => {
    const seller = await seedSeller();
    await seedDesignedListing(seller.id);
    const { listings } = await getApparelListings();
    expect(listings[0].primaryImageUrl).toBe("https://blob/ls-grid.jpg");
  });

  it("falls back to a cached Teemill mockup when a referenced listing has no lifestyle photo", async () => {
    const seller = await seedSeller();
    await seedReferencedListing(seller.id, { colors: ["Evergreen"], withLifestylePhoto: false });
    const { listings } = await getApparelListings();
    expect(listings[0].primaryImageUrl).toBe("https://images.podos.io/mockup-Evergreen.jpg");
  });

  it("never exposes provider names, base price, currency, or sourcingMode on a card", async () => {
    const seller = await seedSeller();
    await seedReferencedListing(seller.id);
    const { listings } = await getApparelListings();
    const json = JSON.stringify(listings[0]);
    expect(json).not.toMatch(/teemill/i);
    expect(json).not.toMatch(/GBP/);
    expect(json).not.toMatch(/REFERENCED|sourcingMode/);
    expect(listings[0]).not.toHaveProperty("providerBasePrice");
  });

  it("paginates at a maximum of 24 listings per page", async () => {
    const seller = await seedSeller();
    for (let i = 0; i < 26; i++) {
      await seedDesignedListing(seller.id, { title: `Tee ${i}`, createdAt: new Date(2026, 5, 1, 0, i) });
    }
    const page1 = await getApparelListings({ page: 1 });
    expect(page1.listings).toHaveLength(24);
    expect(page1.total).toBe(26);
    expect(page1.totalPages).toBe(2);
    const page2 = await getApparelListings({ page: 2 });
    expect(page2.listings).toHaveLength(2);
  });
});
