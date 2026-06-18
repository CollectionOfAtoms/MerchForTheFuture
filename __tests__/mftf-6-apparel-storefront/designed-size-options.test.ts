import { describe, it, expect, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

const { getApparelListingDetail } = await import("@/lib/apparel/detail");
const { getApparelSizesForBlank, DEFAULT_APPAREL_SIZES } = await import("@/lib/apparel/sizes");

async function seedSeller() {
  return prisma.user.create({ data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "S", roles: ["SELLER"] as never } });
}

/** Designed listing whose ProductType has the given size rows (default: NONE — the bug repro). */
async function seedDesigned(sellerId: string, sizes: string[] = []) {
  const pt = await prisma.productType.create({
    data: {
      name: `Unisex Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRODIGI",
      providerSkuBase: "RNA1",
      colors: { create: [{ colorName: "White", providerColorCode: "White", colorImageUrl: "https://blob/w.png" }] },
      sizes: { create: sizes.map((s, i) => ({ sizeLabel: s, providerSizeCode: s, sortOrder: i + 1 })) },
    },
    include: { colors: true },
  });
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "DESIGNED",
      productTypeId: pt.id,
      title: "Solar Punk Bee",
      retailPrice: 28,
      status: "ACTIVE",
      designImageUrl: "https://blob/design.png",
      colors: { create: pt.colors.map((c) => ({ productTypeColorId: c.id, isOffered: true })) },
    },
  });
  return listing;
}

describe("Designed apparel size options (BUG: add-to-cart disabled)", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it("offers provider-sourced sizes when the product type has no curated size rows", async () => {
    const seller = await seedSeller();
    const listing = await seedDesigned(seller.id, []); // no ProductTypeSizeOption rows
    const detail = await getApparelListingDetail(listing.id);
    expect(detail).not.toBeNull();
    // Was [] (which disabled "Add to cart"); now the standard default run.
    expect(detail!.sizes).toEqual([...DEFAULT_APPAREL_SIZES]);
    expect(detail!.sizes.length).toBeGreaterThan(0);
  });

  it("still honors explicit admin-curated size rows when present", async () => {
    const seller = await seedSeller();
    const listing = await seedDesigned(seller.id, ["S", "M", "L"]);
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.sizes).toEqual(["S", "M", "L"]);
  });

  describe("getApparelSizesForBlank", () => {
    it("falls back to the default run for an unknown/unprobed blank", () => {
      expect(getApparelSizesForBlank("SOME-UNPROBED-BLANK")).toEqual([...DEFAULT_APPAREL_SIZES]);
    });
    it("falls back to the default run when no blank is given", () => {
      expect(getApparelSizesForBlank(null)).toEqual([...DEFAULT_APPAREL_SIZES]);
    });
  });
});
