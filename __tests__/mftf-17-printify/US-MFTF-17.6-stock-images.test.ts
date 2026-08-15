import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// US-MFTF-17.6 — the Printify sync captures the blueprint's stock images onto the
// ProductType, and the seller listing-creation projection exposes them so sellers
// see design reference. Images come from the MSW blueprint-detail handler.

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

const { syncDesignedProductTypeFromPrintify } = await import("@/lib/apparel/sync-printify");
const { getActiveProductTypesForListing, toStockImages } = await import("@/lib/apparel/listings");

async function seedPrintifyType() {
  return prisma.productType.create({
    data: {
      name: `Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRINTIFY",
      printifyBlueprintId: 5,
      printifyPrintProviderId: 41,
      isActive: true,
    },
  });
}

describe("US-MFTF-17.6 — Printify sync captures stock images", () => {
  beforeEach(async () => resetDatabase());
  afterEach(async () => resetDatabase());

  it("stores the blueprint's stock image URLs on the product type", async () => {
    const pt = await seedPrintifyType();
    const result = await syncDesignedProductTypeFromPrintify(pt.id);
    expect(result.ok).toBe(true);

    const after = await prisma.productType.findUnique({ where: { id: pt.id } });
    const images = toStockImages(after!.stockImageUrls);
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((u) => u.startsWith("https://images.printify.com/"))).toBe(true);
  });

  it("exposes stockImages on the seller listing-creation projection", async () => {
    const pt = await seedPrintifyType();
    await syncDesignedProductTypeFromPrintify(pt.id);

    const options = await getActiveProductTypesForListing();
    const option = options.find((o) => o.id === pt.id);
    expect(option).toBeTruthy();
    expect(option!.stockImages.length).toBeGreaterThan(0);
  });

  it("toStockImages tolerates null/garbage and returns string URLs only", () => {
    expect(toStockImages(null)).toEqual([]);
    expect(toStockImages("nope")).toEqual([]);
    expect(toStockImages(["a", 3, "b"])).toEqual(["a", "b"]);
  });
});
