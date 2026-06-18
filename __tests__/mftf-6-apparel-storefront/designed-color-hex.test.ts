import { describe, it, expect, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

const { colorNameToHex } = await import("@/lib/apparel/color-hex");
const { getApparelListingDetail } = await import("@/lib/apparel/detail");

describe("designed colour swatches (provider gives names only)", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  describe("colorNameToHex", () => {
    it("maps Prodigi colour names (case/space-insensitive) to a hex", () => {
      expect(colorNameToHex("navy blue")).toBe("#1f2a44");
      expect(colorNameToHex("Navy Blue")).toBe("#1f2a44");
      expect(colorNameToHex("  WHITE ")).toBe("#ffffff");
      expect(colorNameToHex("natural")).toBeTruthy();
    });
    it("returns null for an unknown name", () => {
      expect(colorNameToHex("ultraviolet sparkle")).toBeNull();
      expect(colorNameToHex(null)).toBeNull();
    });
  });

  it("populates hex on a designed listing's colours so swatches render", async () => {
    const seller = await prisma.user.create({ data: { email: `s-${crypto.randomUUID()}@t.com`, roles: ["SELLER"] as never } });
    const pt = await prisma.productType.create({
      data: {
        name: `Tee ${crypto.randomUUID()}`,
        fulfillmentProvider: "PRODIGI",
        providerSkuBase: "BELLA-1010",
        colors: { create: [
          { colorName: "navy blue", providerColorCode: "navy blue", colorImageUrl: null },
          { colorName: "white", providerColorCode: "white", colorImageUrl: null },
        ] },
      },
      include: { colors: true },
    });
    const listing = await prisma.apparelListing.create({
      data: {
        sellerId: seller.id, sourcingMode: "DESIGNED", productTypeId: pt.id, title: "X", retailPrice: 28,
        status: "ACTIVE", designImageUrl: "https://b/d.png",
        colors: { create: pt.colors.map((c) => ({ productTypeColorId: c.id, isOffered: true })) },
      },
    });

    const detail = await getApparelListingDetail(listing.id);
    const navy = detail!.colors.find((c) => c.name === "navy blue")!;
    expect(navy.hex).toBe("#1f2a44"); // was null before — buyer swatch now renders a colour
  });
});
