import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  buildPoweredByPlantsCatalog,
  POWERED_BY_PLANTS_PRODUCT_REF,
  POWERED_BY_PLANTS_PRODUCT_ID,
  POWERED_BY_PLANTS_SLUG,
  TEEMILL_PROJECT_SUB,
} from "../mocks/teemill-fixture";
import { prisma, resetDatabase } from "../helpers/db";
import { ingestTeemillProduct, applyTeemillSnapshot } from "@/lib/fulfillment/teemill";

const CATALOG_URL = "https://api.teemill.com/v1/catalog/products";

async function seedReferencedListing() {
  const seller = await prisma.user.create({
    data: { email: `s-${crypto.randomUUID()}@t.com`, name: "S", roles: ["SELLER"] as never },
  });
  return prisma.apparelListing.create({
    data: {
      sellerId: seller.id,
      sourcingMode: "REFERENCED",
      title: "Powered By Plants",
      retailPrice: 32,
      providerKey: "teemill",
      providerProductRef: POWERED_BY_PLANTS_PRODUCT_REF,
    },
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("US-MFTF-13.2 — verified Teemill auth", () => {
  it("sends the raw key with no Bearer prefix and project = JWT sub (not public key)", async () => {
    let captured: { auth: string | null; project: string | null } = { auth: null, project: null };
    server.use(
      http.get(CATALOG_URL, ({ request }) => {
        const url = new URL(request.url);
        captured = {
          auth: request.headers.get("Authorization"),
          project: url.searchParams.get("project"),
        };
        return HttpResponse.json(buildPoweredByPlantsCatalog());
      }),
    );

    await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);

    expect(captured.auth).toBe(process.env.TEEMILL_API_KEY);
    expect(captured.auth?.startsWith("Bearer")).toBe(false);
    expect(captured.project).toBe(TEEMILL_PROJECT_SUB);
    // The public key must NOT be used as the project.
    expect(captured.project).not.toBe(process.env.TEEMILL_PUBLIC_KEY);
  });
});

// ─── Parser ───────────────────────────────────────────────────────────────────

describe("US-MFTF-13.2 — ingestTeemillProduct parser", () => {
  it("resolves a product by its ref and returns a normalized snapshot", async () => {
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snap = result.snapshot;
    expect(snap.title).toBe("Powered By Plants");
    expect(snap.providerKey).toBe("teemill");
    expect(snap.providerProductRef).toBe(POWERED_BY_PLANTS_PRODUCT_REF);
    expect(snap.slug).toBe(POWERED_BY_PLANTS_SLUG);
  });

  it("also resolves a product by its id or slug", async () => {
    const byId = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_ID);
    const bySlug = await ingestTeemillProduct(POWERED_BY_PLANTS_SLUG);
    expect(byId.ok).toBe(true);
    expect(bySlug.ok).toBe(true);
  });

  it("carries the product's Teemill description (raw HTML) on the snapshot", async () => {
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!result.ok) throw new Error("expected ok");
    expect(result.snapshot.description).toBe("<p>Organic cotton tee.</p>");
  });

  it("parses GBP base currency and price from the variant", async () => {
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!result.ok) throw new Error("expected ok");
    expect(result.snapshot.providerBaseCurrency).toBe("GBP");
    expect(result.snapshot.providerBasePrice).toBe(21);
  });

  it("maps colour hex from the Colour attribute thumbnail", async () => {
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!result.ok) throw new Error("expected ok");
    const evergreen = result.snapshot.variants.find((v) => v.colorName === "Evergreen");
    expect(evergreen?.colorHex).toBe("#23312d");
  });

  it("uses absolute /catalog/variants/ refs", async () => {
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!result.ok) throw new Error("expected ok");
    for (const v of result.snapshot.variants) {
      expect(v.variantRef).toMatch(
        /^https:\/\/api\.teemill\.com\/v1\/catalog\/variants\//,
      );
    }
  });

  it("matches the per-colour mockup to its variants by variantIds", async () => {
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!result.ok) throw new Error("expected ok");
    const evergreen = result.snapshot.variants.find((v) => v.colorName === "Evergreen");
    const brown = result.snapshot.variants.find((v) => v.colorName === "Brown");
    expect(evergreen?.mockupUrl).toContain("evergreen");
    expect(brown?.mockupUrl).toContain("brown");
    expect(evergreen?.mockupUrl).not.toBe(brown?.mockupUrl);
  });

  it("derives isOrderable from print-on-demand availability, not warehouse stock", async () => {
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!result.ok) throw new Error("expected ok");
    // Denim Blue / M has 0 warehouse stock but is printable on demand (gfnVariant) →
    // still orderable. Teemill is print-on-demand; warehouse stock is not the gate.
    const noWarehouseStock = result.snapshot.variants.find(
      (v) => v.colorName === "Denim Blue" && v.sizeLabel === "M",
    );
    const inStock = result.snapshot.variants.find(
      (v) => v.colorName === "Evergreen" && v.sizeLabel === "M",
    );
    expect(noWarehouseStock?.stockLevel).toBe(0);
    expect(noWarehouseStock?.isOrderable).toBe(true);
    expect(inStock?.isOrderable).toBe(true);
  });

  it("marks a variant not orderable only when it has neither stock nor a print-on-demand path", async () => {
    server.use(
      http.get(CATALOG_URL, () => HttpResponse.json(buildPoweredByPlantsCatalog({ forceStock: 0, noGfn: true }))),
    );
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!result.ok) throw new Error("expected ok");
    expect(result.snapshot.variants.every((v) => v.isOrderable === false)).toBe(true);
  });

  it("stores whatever colours the catalog returns (no 3-colour cap enforced)", async () => {
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!result.ok) throw new Error("expected ok");
    const colours = new Set(result.snapshot.variants.map((v) => v.colorName));
    expect(colours.size).toBe(3);
  });
});

// ─── Errors returned, not thrown ──────────────────────────────────────────────

describe("US-MFTF-13.2 — error handling", () => {
  it("returns an error (not thrown) when the ref is not in the project", async () => {
    const result = await ingestTeemillProduct("https://api.teemill.com/v1/catalog/products/not-real");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not found|could not|resolve/i);
  });

  it("returns an error when the product is disabled", async () => {
    server.use(
      http.get(CATALOG_URL, () => HttpResponse.json(buildPoweredByPlantsCatalog({ enabled: false }))),
    );
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/disabled/i);
  });

  it("returns an error when auth fails (401)", async () => {
    server.use(
      http.get(CATALOG_URL, () => HttpResponse.json({ message: "Unauthorized" }, { status: 401 })),
    );
    const result = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    expect(result.ok).toBe(false);
  });
});

// ─── Idempotent persistence ───────────────────────────────────────────────────

describe("US-MFTF-13.2 — applyTeemillSnapshot persistence", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("persists ReferencedVariant rows and refreshes provider fields + snapshotFetchedAt", async () => {
    const listing = await seedReferencedListing();
    const ingest = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!ingest.ok) throw new Error("expected ok");

    await applyTeemillSnapshot(listing.id, ingest.snapshot);

    const variants = await prisma.referencedVariant.findMany({
      where: { apparelListingId: listing.id },
    });
    expect(variants).toHaveLength(ingest.snapshot.variants.length);

    const refreshed = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(Number(refreshed!.providerBasePrice)).toBe(21);
    expect(refreshed!.providerBaseCurrency).toBe("GBP");
    expect(refreshed!.snapshotFetchedAt).not.toBeNull();
  });

  it("is idempotent — re-running replaces rows rather than duplicating", async () => {
    const listing = await seedReferencedListing();
    const first = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!first.ok) throw new Error("expected ok");
    await applyTeemillSnapshot(listing.id, first.snapshot);
    await applyTeemillSnapshot(listing.id, first.snapshot);

    const count = await prisma.referencedVariant.count({
      where: { apparelListingId: listing.id },
    });
    expect(count).toBe(first.snapshot.variants.length);
  });

  it("refreshes the cached base price when Teemill's price changes", async () => {
    const listing = await seedReferencedListing();
    const first = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!first.ok) throw new Error("expected ok");
    await applyTeemillSnapshot(listing.id, first.snapshot);

    server.use(
      http.get(CATALOG_URL, () => HttpResponse.json(buildPoweredByPlantsCatalog({ basePrice: 25 }))),
    );
    const second = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
    if (!second.ok) throw new Error("expected ok");
    await applyTeemillSnapshot(listing.id, second.snapshot);

    const refreshed = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(Number(refreshed!.providerBasePrice)).toBe(25);
  });
});
