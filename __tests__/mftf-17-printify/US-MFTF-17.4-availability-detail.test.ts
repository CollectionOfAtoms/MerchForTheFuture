import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { prisma, resetDatabase } from "../helpers/db";

// US-MFTF-17.4 — the product-detail projection carries a live per-(colour,size)
// availability signal for DESIGNED Printify listings. The cached catalog is the
// FULL range (US-MFTF-17.2, show-out-of-stock=1); the live DEFAULT variants list
// (in-stock only) says what's orderable NOW; `unavailable` = full − orderable.
// The global MSW printify variants handler models this: full with the flag, and an
// in-stock subset (Black/M dropped) without it.

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

const { getApparelListingDetail } = await import("@/lib/apparel/detail");

const VARIANTS_URL =
  "https://api.printify.com/v1/catalog/blueprints/:bp/print_providers/:pp/variants.json";

/** A DESIGNED Printify listing offering Heather Grey + Black in S + M. */
async function seedPrintifyListing() {
  const seller = await prisma.user.create({ data: { email: `s-${crypto.randomUUID()}@t.com`, roles: ["SELLER"] } });
  const pt = await prisma.productType.create({
    data: {
      name: `Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRINTIFY",
      printifyBlueprintId: 5,
      printifyPrintProviderId: 41,
      colors: { create: [
        { colorName: "Heather Grey", providerColorCode: "Heather Grey", colorImageUrl: null },
        { colorName: "Black", providerColorCode: "Black", colorImageUrl: null },
      ] },
      sizes: { create: [
        { sizeLabel: "S", providerSizeCode: "S", sortOrder: 0 },
        { sizeLabel: "M", providerSizeCode: "M", sortOrder: 1 },
      ] },
      printifyVariants: { create: [
        { colorName: "Heather Grey", sizeLabel: "S", printifyVariantId: 17391 },
        { colorName: "Heather Grey", sizeLabel: "M", printifyVariantId: 17392 },
        { colorName: "Black", sizeLabel: "S", printifyVariantId: 17401 },
        { colorName: "Black", sizeLabel: "M", printifyVariantId: 17402 },
      ] },
    },
    include: { colors: true },
  });
  return prisma.apparelListing.create({
    data: {
      sellerId: seller.id, sourcingMode: "DESIGNED", productTypeId: pt.id,
      title: "Solar Bloom Tee", retailPrice: 30, status: "ACTIVE", designImageUrl: "https://b/d.png",
      colors: { create: pt.colors.map((c) => ({ productTypeColorId: c.id, isOffered: true })) },
    },
  });
}

describe("US-MFTF-17.4 — detail projection carries live Printify availability", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("marks the out-of-stock (colour,size) combo unavailable, leaves in-stock ones available", async () => {
    const listing = await seedPrintifyListing();
    const detail = await getApparelListingDetail(listing.id);

    expect(detail!.colors.map((c) => c.name).sort()).toEqual(["Black", "Heather Grey"]);
    expect(detail!.sizes).toEqual(["S", "M"]);

    const unavailable = detail!.unavailable ?? [];
    // Black/M is out of stock in the default (in-stock) list; nothing else is.
    expect(unavailable).toContainEqual({ color: "Black", size: "M" });
    expect(unavailable).toHaveLength(1);
    expect(unavailable).not.toContainEqual({ color: "Heather Grey", size: "M" });
    expect(unavailable).not.toContainEqual({ color: "Black", size: "S" });
  });

  it("fails OPEN: if the availability read errors, nothing is marked unavailable", async () => {
    server.use(http.get(VARIANTS_URL, () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    const listing = await seedPrintifyListing();
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.unavailable ?? []).toEqual([]);
  });

  it("does not run an availability read for a non-Printify (Prodigi) listing", async () => {
    let printifyHit = false;
    server.use(http.get(VARIANTS_URL, () => { printifyHit = true; return HttpResponse.json({ variants: [] }); }));
    const seller = await prisma.user.create({ data: { email: `s-${crypto.randomUUID()}@t.com`, roles: ["SELLER"] } });
    const pt = await prisma.productType.create({
      data: {
        name: `Tee ${crypto.randomUUID()}`, fulfillmentProvider: "PRODIGI", providerSkuBase: "BELLA-1010",
        colors: { create: [{ colorName: "White", providerColorCode: "White" }] },
        sizes: { create: [{ sizeLabel: "M", providerSizeCode: "M", sortOrder: 0 }] },
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
    expect(detail!.unavailable ?? []).toEqual([]);
    expect(printifyHit).toBe(false);
  });
});
