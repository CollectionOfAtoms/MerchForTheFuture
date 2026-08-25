import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  buildPrintifyReferencedProduct,
  PRINTIFY_PRODUCT_ID,
} from "../mocks/printify-fixture";
import { prisma, resetDatabase } from "../helpers/db";
import { ingestPrintifyProduct, applyPrintifySnapshot } from "@/lib/fulfillment/printify";
import { getApparelListingDetail } from "@/lib/apparel/detail";

// Shop-scoped endpoints need a shop id (Printify's analog of Teemill's project).
process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

const PRODUCT_URL = "https://api.printify.com/v1/shops/:shop/products/:id.json";

async function seedReferencedPrintifyListing() {
  const seller = await prisma.user.create({
    data: { email: `s-${crypto.randomUUID()}@t.com`, name: "S", roles: ["SELLER"] as never },
  });
  return prisma.apparelListing.create({
    data: {
      sellerId: seller.id,
      sourcingMode: "REFERENCED",
      status: "ACTIVE",
      title: "Protect Our Oceans",
      retailPrice: 40,
      providerKey: "printify",
      providerProductRef: PRINTIFY_PRODUCT_ID,
    },
  });
}

// ─── Parser ───────────────────────────────────────────────────────────────────

describe("US-MFTF-17.12 — ingestPrintifyProduct parser", () => {
  it("resolves a shop product by product_id into a normalized snapshot", async () => {
    const result = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snap = result.snapshot;
    expect(snap.providerKey).toBe("printify");
    expect(snap.providerProductRef).toBe(PRINTIFY_PRODUCT_ID);
    expect(snap.title).toBe("Protect Our Oceans");
    expect(snap.variants).toHaveLength(4);
  });

  it("stores the integer variant_id (as a string) in variantRef", async () => {
    const result = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!result.ok) throw new Error("expected ok");
    const hgSmall = result.snapshot.variants.find(
      (v) => v.colorName === "Heather Grey" && v.sizeLabel === "S",
    );
    expect(hgSmall?.variantRef).toBe("17391");
  });

  it("populates colour name + hex from the product option values (order-independent)", async () => {
    const result = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!result.ok) throw new Error("expected ok");
    const hg = result.snapshot.variants.find((v) => v.colorName === "Heather Grey");
    const black = result.snapshot.variants.find((v) => v.colorName === "Black");
    expect(hg?.colorHex).toBe("#b8bcc2");
    expect(black?.colorHex).toBe("#111111");
  });

  it("matches the per-colour mockup from images[] by variant_ids", async () => {
    const result = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!result.ok) throw new Error("expected ok");
    const hg = result.snapshot.variants.find((v) => v.colorName === "Heather Grey");
    const black = result.snapshot.variants.find((v) => v.colorName === "Black");
    expect(hg?.mockupUrl).toContain("heather-grey");
    expect(black?.mockupUrl).toContain("black");
    expect(hg?.mockupUrl).not.toBe(black?.mockupUrl);
  });

  it("parses USD base cost from variant cost cents (2200 → 22.00 USD)", async () => {
    const result = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!result.ok) throw new Error("expected ok");
    expect(result.snapshot.providerBaseCurrency).toBe("USD");
    expect(result.snapshot.providerBasePrice).toBe(22);
  });

  it("ingests only merchant-enabled variants (a disabled variant is excluded)", async () => {
    server.use(
      http.get(PRODUCT_URL, () =>
        HttpResponse.json(buildPrintifyReferencedProduct({ disabledVariantIds: [17402] })),
      ),
    );
    const result = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!result.ok) throw new Error("expected ok");
    expect(result.snapshot.variants).toHaveLength(3);
    expect(
      result.snapshot.variants.find((v) => v.colorName === "Black" && v.sizeLabel === "M"),
    ).toBeUndefined();
  });

  it("derives isOrderable from enabled + available (Black/M is out of stock)", async () => {
    const result = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!result.ok) throw new Error("expected ok");
    const inStock = result.snapshot.variants.find(
      (v) => v.colorName === "Black" && v.sizeLabel === "S",
    );
    const oos = result.snapshot.variants.find(
      (v) => v.colorName === "Black" && v.sizeLabel === "M",
    );
    expect(inStock?.isOrderable).toBe(true);
    expect(oos?.isOrderable).toBe(false);
  });
});

// ─── Errors returned, not thrown ──────────────────────────────────────────────

describe("US-MFTF-17.12 — error handling", () => {
  it("returns an error (not thrown) when the product is not found (404)", async () => {
    server.use(
      http.get(PRODUCT_URL, () => HttpResponse.json({ message: "Not found" }, { status: 404 })),
    );
    const result = await ingestPrintifyProduct("missing-id");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not find|not found|could not/i);
  });

  it("returns an error when auth fails (401)", async () => {
    server.use(
      http.get(PRODUCT_URL, () => HttpResponse.json({ message: "Unauthorized" }, { status: 401 })),
    );
    const result = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/auth/i);
  });

  it("returns an error (not thrown) on a network failure", async () => {
    server.use(http.get(PRODUCT_URL, () => HttpResponse.error()));
    const result = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    expect(result.ok).toBe(false);
  });
});

// ─── Idempotent persistence ───────────────────────────────────────────────────

describe("US-MFTF-17.12 — applyPrintifySnapshot persistence", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("persists ReferencedVariant rows per (colour,size) and refreshes provider fields", async () => {
    const listing = await seedReferencedPrintifyListing();
    const ingest = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!ingest.ok) throw new Error("expected ok");

    await applyPrintifySnapshot(listing.id, ingest.snapshot);

    const variants = await prisma.referencedVariant.findMany({
      where: { apparelListingId: listing.id },
      orderBy: { id: "asc" },
    });
    expect(variants).toHaveLength(4);
    const oos = variants.find((v) => v.colorName === "Black" && v.sizeLabel === "M");
    expect(oos?.variantRef).toBe("17402");
    expect(oos?.isOrderable).toBe(false);

    const refreshed = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(Number(refreshed!.providerBasePrice)).toBe(22);
    expect(refreshed!.providerBaseCurrency).toBe("USD");
    expect(refreshed!.snapshotFetchedAt).not.toBeNull();
  });

  it("is idempotent — re-running replaces rows rather than duplicating", async () => {
    const listing = await seedReferencedPrintifyListing();
    const first = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!first.ok) throw new Error("expected ok");
    await applyPrintifySnapshot(listing.id, first.snapshot);
    await applyPrintifySnapshot(listing.id, first.snapshot);

    const count = await prisma.referencedVariant.count({
      where: { apparelListingId: listing.id },
    });
    expect(count).toBe(4);
  });

  it("refreshes the cached base price when Printify's price changes", async () => {
    const listing = await seedReferencedPrintifyListing();
    const first = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!first.ok) throw new Error("expected ok");
    await applyPrintifySnapshot(listing.id, first.snapshot);

    server.use(
      http.get(PRODUCT_URL, () =>
        HttpResponse.json(buildPrintifyReferencedProduct({ cost: 2500 })),
      ),
    );
    const second = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!second.ok) throw new Error("expected ok");
    await applyPrintifySnapshot(listing.id, second.snapshot);

    const refreshed = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(Number(refreshed!.providerBasePrice)).toBe(25);
  });
});

// ─── Buyer-opacity + fail-open through the normalized read-shape ───────────────

describe("US-MFTF-17.12 — renders opaquely through the referenced read-shape", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("projects colours, sizes and mockups with NO provider identity, fail-open on availability", async () => {
    const listing = await seedReferencedPrintifyListing();
    const ingest = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!ingest.ok) throw new Error("expected ok");
    await applyPrintifySnapshot(listing.id, ingest.snapshot);

    const detail = await getApparelListingDetail(listing.id);
    expect(detail).not.toBeNull();
    if (!detail) return;

    // Renders like any referenced (Teemill) listing.
    expect(detail.colors.map((c) => c.name).sort()).toEqual(["Black", "Heather Grey"]);
    expect(detail.colors.find((c) => c.name === "Heather Grey")?.hex).toBe("#b8bcc2");
    expect(detail.sizes).toEqual(expect.arrayContaining(["S", "M"]));
    expect(detail.images.some((i) => i.colorName === "Heather Grey")).toBe(true);

    // Fail-open: a referenced listing has no DESIGNED-Printify availability probe,
    // so nothing is force-hidden at detail-build (checkout revalidation is the gate).
    expect(detail.unavailable ?? []).toEqual([]);

    // Buyer-opacity is unconditional: no provider-identity fields or ids in the
    // buyer-facing projection — no product_id, variant_id, providerKey, or
    // sourcingMode. (The per-colour mockup is legitimately served from the provider's
    // image CDN — buyers must see it — exactly as Teemill mockups come from Teemill's
    // CDN; the mockup host is not a provider-identity leak.)
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain(PRINTIFY_PRODUCT_ID);
    expect(serialized).not.toContain("17391"); // variant_id
    expect(serialized.toLowerCase()).not.toContain("providerkey");
    expect(serialized.toLowerCase()).not.toContain("providerproductref");
    expect(serialized.toLowerCase()).not.toContain("variantref");
    expect(serialized.toLowerCase()).not.toContain("sourcingmode");
  });
});
