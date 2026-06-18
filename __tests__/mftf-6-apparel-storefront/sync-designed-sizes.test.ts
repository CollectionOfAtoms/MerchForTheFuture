import { describe, it, expect, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { prisma, resetDatabase } from "../helpers/db";

const { syncDesignedSizesFromProdigi, extractProdigiSizes } = await import("@/lib/apparel/sync-sizes");
const { getApparelListingDetail } = await import("@/lib/apparel/detail");

const PRODIGI_BASES = ["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"];

/** Stub Prodigi GET /products/:sku, returning sizes per blank (or 404 for unknown). */
function stubProdigiProducts(sizesBySku: Record<string, string[] | null>) {
  server.use(
    ...PRODIGI_BASES.map((base) =>
      http.get(`${base}/products/:sku`, ({ params }) => {
        const sku = String(params.sku);
        const sizes = sizesBySku[sku];
        if (sizes == null) return HttpResponse.json({ message: "not found" }, { status: 404 });
        return HttpResponse.json({ product: { sku, attributes: { size: sizes } } });
      }),
    ),
  );
}

async function seedDesignedType(providerSkuBase: string) {
  const pt = await prisma.productType.create({
    data: { name: `Type ${crypto.randomUUID()}`, fulfillmentProvider: "PRODIGI", providerSkuBase },
  });
  const seller = await prisma.user.create({ data: { email: `s-${crypto.randomUUID()}@t.com`, roles: ["SELLER"] as never } });
  const listing = await prisma.apparelListing.create({
    data: { sellerId: seller.id, sourcingMode: "DESIGNED", productTypeId: pt.id, title: "X", retailPrice: 28, status: "ACTIVE", designImageUrl: "https://b/d.png" },
  });
  return { pt, listing };
}

describe("syncDesignedSizesFromProdigi", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it("extractProdigiSizes reads attributes.size, else unique variant sizes", () => {
    expect(extractProdigiSizes({ attributes: { size: ["S", "M", "L"] } })).toEqual(["S", "M", "L"]);
    expect(extractProdigiSizes({ variants: [{ attributes: { size: "M" } }, { attributes: { size: "M" } }, { attributes: { size: "L" } }] })).toEqual(["M", "L"]);
    expect(extractProdigiSizes(null)).toEqual([]);
  });

  it("syncs all designed blanks in one pass and persists ProductTypeSizeOption rows", async () => {
    stubProdigiProducts({ "BLANK-TEE": ["S", "M", "L", "XL"], "BLANK-HOODIE": ["M", "L", "XL", "XXL"] });
    const tee = await seedDesignedType("BLANK-TEE");
    const hoodie = await seedDesignedType("BLANK-HOODIE");

    const result = await syncDesignedSizesFromProdigi();
    expect(result.total).toBe(2);
    expect(result.synced).toHaveLength(2);

    // Sizes now come from the synced rows via the normal read path.
    const teeDetail = await getApparelListingDetail(tee.listing.id);
    expect(teeDetail!.sizes).toEqual(["S", "M", "L", "XL"]);
    const hoodieDetail = await getApparelListingDetail(hoodie.listing.id);
    expect(hoodieDetail!.sizes).toEqual(["M", "L", "XL", "XXL"]);
  });

  it("leaves a blank untouched (keeps the default fallback) when Prodigi returns nothing", async () => {
    stubProdigiProducts({ "BLANK-UNKNOWN": null }); // 404
    const { listing } = await seedDesignedType("BLANK-UNKNOWN");

    const result = await syncDesignedSizesFromProdigi();
    expect(result.synced).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);

    // No rows written → toSizes falls back to the default run (still orderable).
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.sizes).toEqual(["XS", "S", "M", "L", "XL", "XXL"]);
  });

  it("ignores Teemill (referenced) product types", async () => {
    stubProdigiProducts({});
    await prisma.productType.create({
      data: { name: `Teemill ${crypto.randomUUID()}`, fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    const result = await syncDesignedSizesFromProdigi();
    expect(result.total).toBe(0);
  });
});
