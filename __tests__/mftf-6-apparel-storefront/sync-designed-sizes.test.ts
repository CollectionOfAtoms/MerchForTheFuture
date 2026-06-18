import { describe, it, expect, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { prisma, resetDatabase } from "../helpers/db";

const { syncDesignedAttributesFromProdigi, extractProdigiSizes, extractProdigiColors } = await import("@/lib/apparel/sync-prodigi");
const { getApparelListingDetail } = await import("@/lib/apparel/detail");

const PRODIGI_BASES = ["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"];

/** Stub Prodigi GET /products/:sku with sizes (+ optional colours) per blank (404 for unknown). */
function stubProdigiProducts(bySku: Record<string, { size?: string[]; color?: string[] } | null>) {
  server.use(
    ...PRODIGI_BASES.map((base) =>
      http.get(`${base}/products/:sku`, ({ params }) => {
        const sku = String(params.sku);
        const attrs = bySku[sku];
        if (attrs == null) return HttpResponse.json({ message: "not found" }, { status: 404 });
        return HttpResponse.json({ product: { sku, attributes: attrs } });
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

describe("syncDesignedAttributesFromProdigi", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it("extractProdigiSizes reads attributes.size, else unique variant sizes", () => {
    expect(extractProdigiSizes({ attributes: { size: ["S", "M", "L"] } })).toEqual(["S", "M", "L"]);
    expect(extractProdigiSizes({ variants: [{ attributes: { size: "M" } }, { attributes: { size: "M" } }, { attributes: { size: "L" } }] })).toEqual(["M", "L"]);
    expect(extractProdigiSizes(null)).toEqual([]);
  });

  it("extractProdigiColors reads attributes.colour/color, else unique variant colours", () => {
    expect(extractProdigiColors({ attributes: { colour: ["White", "Black"] } })).toEqual(["White", "Black"]);
    expect(extractProdigiColors({ variants: [{ attributes: { color: "Navy" } }, { attributes: { color: "Navy" } }] })).toEqual(["Navy"]);
    expect(extractProdigiColors(null)).toEqual([]);
  });

  it("syncs sizes and colours for all designed blanks in one pass", async () => {
    stubProdigiProducts({
      "BLANK-TEE": { size: ["S", "M", "L", "XL"], color: ["White", "Black", "Navy"] },
      "BLANK-HOODIE": { size: ["M", "L", "XL", "XXL"], color: ["Heather", "Black"] },
    });
    const tee = await seedDesignedType("BLANK-TEE");
    await seedDesignedType("BLANK-HOODIE");

    const result = await syncDesignedAttributesFromProdigi();
    expect(result.total).toBe(2);
    expect(result.synced).toHaveLength(2);

    // Sizes flow through the read path…
    const teeDetail = await getApparelListingDetail(tee.listing.id);
    expect(teeDetail!.sizes).toEqual(["S", "M", "L", "XL"]);
    // …and colours are now available on the product type for the listing picker.
    const teeColors = await prisma.productTypeColor.findMany({ where: { productTypeId: tee.pt.id }, orderBy: { colorName: "asc" } });
    expect(teeColors.map((c) => c.colorName)).toEqual(["Black", "Navy", "White"]);
  });

  it("adds colours additively without deleting ones a listing already offers", async () => {
    // First sync seeds White/Black; a listing offers Black; second sync adds Navy
    // and must NOT delete Black (ApparelListingColor FK).
    stubProdigiProducts({ "BLANK-TEE": { size: ["M"], color: ["White", "Black"] } });
    const { pt } = await seedDesignedType("BLANK-TEE");
    await syncDesignedAttributesFromProdigi();
    const black = await prisma.productTypeColor.findFirstOrThrow({ where: { productTypeId: pt.id, colorName: "Black" } });
    const seller = await prisma.user.create({ data: { email: `s2-${crypto.randomUUID()}@t.com`, roles: ["SELLER"] as never } });
    const listing = await prisma.apparelListing.create({ data: { sellerId: seller.id, sourcingMode: "DESIGNED", productTypeId: pt.id, title: "Y", retailPrice: 28, status: "ACTIVE", designImageUrl: "https://b/d.png" } });
    await prisma.apparelListingColor.create({ data: { apparelListingId: listing.id, productTypeColorId: black.id, isOffered: true } });

    stubProdigiProducts({ "BLANK-TEE": { size: ["M"], color: ["White", "Black", "Navy"] } });
    await syncDesignedAttributesFromProdigi(); // must not throw on the FK'd Black row

    const colors = await prisma.productTypeColor.findMany({ where: { productTypeId: pt.id } });
    expect(new Set(colors.map((c) => c.colorName))).toEqual(new Set(["White", "Black", "Navy"]));
  });

  it("leaves a blank untouched (size fallback) when Prodigi returns nothing", async () => {
    stubProdigiProducts({ "BLANK-UNKNOWN": null }); // 404
    const { listing } = await seedDesignedType("BLANK-UNKNOWN");

    const result = await syncDesignedAttributesFromProdigi();
    expect(result.synced).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);

    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.sizes).toEqual(["XS", "S", "M", "L", "XL", "XXL"]);
  });

  it("ignores Teemill (referenced) product types", async () => {
    stubProdigiProducts({});
    await prisma.productType.create({
      data: { name: `Teemill ${crypto.randomUUID()}`, fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    const result = await syncDesignedAttributesFromProdigi();
    expect(result.total).toBe(0);
  });
});
