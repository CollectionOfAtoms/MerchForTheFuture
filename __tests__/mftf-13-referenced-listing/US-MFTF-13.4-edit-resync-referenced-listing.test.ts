import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  buildPoweredByPlantsCatalog,
  POWERED_BY_PLANTS_PRODUCT_REF,
  POWERED_BY_PLANTS_SLUG,
  TEEMILL_PROJECT_SUB,
  EXPECTED_VARIANT_REF_FOR,
} from "../mocks/teemill-fixture";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const {
  updateReferencedListingAction,
  resyncReferencedListingAction,
} = await import("@/app/actions/referenced-apparel");
const { getReferencedListingForEdit } = await import("@/lib/apparel/listings");
const { referencedListingCarousel } = await import("@/lib/apparel/referenced");
const {
  ingestTeemillProduct,
  applyTeemillSnapshot,
  teemillEditUrl,
  teemillDesignerUrl,
} = await import("@/lib/fulfillment/teemill");
const { auth } = await import("@/auth");

const EXPECTED_DESIGNER_URL = `https://teemill.com/create-a-product/?project=${TEEMILL_PROJECT_SUB}`;
const EXPECTED_EDIT_URL = `https://teemill.com/create-a-product/${POWERED_BY_PLANTS_SLUG}/?project=${TEEMILL_PROJECT_SUB}`;

const CATALOG_URL = "https://api.teemill.com/v1/catalog/products";

async function seedSeller() {
  return prisma.user.create({
    data: { email: `s-${crypto.randomUUID()}@t.com`, name: "S", roles: ["SELLER"] as never },
  });
}

/** Create a referenced listing and seed its variant snapshot from the fixture. */
async function seedReferencedListing(sellerId: string) {
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      title: "Powered By Plants",
      description: "Tee",
      retailPrice: 32,
      providerKey: "teemill",
      providerProductRef: POWERED_BY_PLANTS_PRODUCT_REF,
    },
  });
  const ingest = await ingestTeemillProduct(POWERED_BY_PLANTS_PRODUCT_REF);
  if (!ingest.ok) throw new Error("seed ingest failed");
  await applyTeemillSnapshot(listing.id, ingest.snapshot);
  return listing;
}

function makeForm(fields: { title?: string; description?: string; retailPrice?: string; providerProductRef?: string }): FormData {
  const fd = new FormData();
  if (fields.title !== undefined) fd.set("title", fields.title);
  if (fields.description !== undefined) fd.set("description", fields.description);
  if (fields.retailPrice !== undefined) fd.set("retailPrice", fields.retailPrice);
  if (fields.providerProductRef !== undefined) fd.set("providerProductRef", fields.providerProductRef);
  return fd;
}

// ─── updateReferencedListingAction ────────────────────────────────────────────

describe("US-MFTF-13.4 — updateReferencedListingAction", () => {
  let seller: Awaited<ReturnType<typeof seedSeller>>;
  beforeEach(async () => {
    await resetDatabase();
    seller = await seedSeller();
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns Unauthorized for a non-seller", async () => {
    const listing = await seedReferencedListing(seller.id);
    vi.mocked(auth).mockResolvedValue({ user: { id: "b", roles: ["BUYER"] } } as never);
    const res = await updateReferencedListingAction(listing.id, undefined, makeForm({ title: "X", retailPrice: "30" }));
    expect(res).toEqual({ error: "Unauthorized" });
  });

  it("returns an error for a listing the seller does not own", async () => {
    const other = await seedSeller();
    const listing = await seedReferencedListing(other.id);
    const res = await updateReferencedListingAction(listing.id, undefined, makeForm({ title: "X", retailPrice: "30" }));
    expect(res).toMatchObject({ error: expect.stringMatching(/not found/i) });
  });

  it("updates title, description, and retail price", async () => {
    const listing = await seedReferencedListing(seller.id);
    const res = await updateReferencedListingAction(
      listing.id,
      undefined,
      makeForm({ title: "Powered By Plants v2", description: "Updated", retailPrice: "35" }),
    );
    expect(res).toEqual({ success: true });
    const updated = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(updated!.title).toBe("Powered By Plants v2");
    expect(updated!.description).toBe("Updated");
    expect(Number(updated!.retailPrice)).toBe(35);
  });

  it("rejects a retail price below $1", async () => {
    const listing = await seedReferencedListing(seller.id);
    const res = await updateReferencedListingAction(listing.id, undefined, makeForm({ title: "X", retailPrice: "0.50" }));
    expect(res).toMatchObject({ error: expect.stringMatching(/price/i) });
  });

  it("refuses to change providerProductRef after creation", async () => {
    const listing = await seedReferencedListing(seller.id);
    const res = await updateReferencedListingAction(
      listing.id,
      undefined,
      makeForm({ title: "X", retailPrice: "30", providerProductRef: "some-other-ref" }),
    );
    expect(res).toMatchObject({ error: expect.stringMatching(/cannot be changed|product ref/i) });
    const unchanged = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(unchanged!.providerProductRef).toBe(POWERED_BY_PLANTS_PRODUCT_REF);
  });

  it("is read-only for SOLD listings", async () => {
    const listing = await seedReferencedListing(seller.id);
    await prisma.apparelListing.update({ where: { id: listing.id }, data: { status: "SOLD" } });
    const res = await updateReferencedListingAction(listing.id, undefined, makeForm({ title: "X", retailPrice: "40" }));
    expect(res).toMatchObject({ error: expect.stringMatching(/read-only|sold/i) });
  });
});

// ─── resyncReferencedListingAction ────────────────────────────────────────────

describe("US-MFTF-13.4 — resyncReferencedListingAction", () => {
  let seller: Awaited<ReturnType<typeof seedSeller>>;
  beforeEach(async () => {
    await resetDatabase();
    seller = await seedSeller();
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("refreshes the cached base price and reports it in the change summary", async () => {
    const listing = await seedReferencedListing(seller.id);
    server.use(
      http.get(CATALOG_URL, () => HttpResponse.json(buildPoweredByPlantsCatalog({ basePrice: 25 }))),
    );
    const res = await resyncReferencedListingAction(listing.id);
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.changes.join(" ")).toMatch(/25/);
    const updated = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(Number(updated!.providerBasePrice)).toBe(25);
  });

  it("reports a variant going out of stock", async () => {
    const listing = await seedReferencedListing(seller.id);
    // Denim Blue S was in stock (10) — drop it to 0.
    server.use(
      http.get(CATALOG_URL, () =>
        HttpResponse.json(buildPoweredByPlantsCatalog({ stockOverrides: { "v-denimblue-s": 0 } })),
      ),
    );
    const res = await resyncReferencedListingAction(listing.id);
    if ("error" in res) throw new Error(res.error);
    expect(res.changes.join(" ")).toMatch(/denim blue.*out of stock/i);
  });

  it("removes a vanished variant that has no orders", async () => {
    const listing = await seedReferencedListing(seller.id);
    server.use(
      http.get(CATALOG_URL, () => HttpResponse.json(buildPoweredByPlantsCatalog({ omit: ["v-brown-m"] }))),
    );
    await resyncReferencedListingAction(listing.id);
    const gone = await prisma.referencedVariant.findFirst({
      where: { apparelListingId: listing.id, variantRef: EXPECTED_VARIANT_REF_FOR("v-brown-m") },
    });
    expect(gone).toBeNull();
  });

  it("keeps a vanished-but-ordered variant, marking it isOrderable:false instead of deleting", async () => {
    const listing = await seedReferencedListing(seller.id);
    const orderedRef = EXPECTED_VARIANT_REF_FOR("v-evergreen-m");
    // Seed an order referencing that variant (listingType is a placeholder until MFTF-12).
    await prisma.order.create({
      data: {
        buyerId: seller.id,
        listingType: "ORIGINAL",
        apparelListingId: listing.id,
        externalSku: orderedRef,
        subtotal: 32,
        totalAmount: 32,
        status: "PAID",
      },
    });

    server.use(
      http.get(CATALOG_URL, () => HttpResponse.json(buildPoweredByPlantsCatalog({ omit: ["v-evergreen-m"] }))),
    );
    await resyncReferencedListingAction(listing.id);

    const kept = await prisma.referencedVariant.findFirst({
      where: { apparelListingId: listing.id, variantRef: orderedRef },
    });
    expect(kept).not.toBeNull();
    expect(kept!.isOrderable).toBe(false);
  });

  it("returns 'no changes' when nothing changed on re-sync", async () => {
    const listing = await seedReferencedListing(seller.id);
    const res = await resyncReferencedListingAction(listing.id);
    if ("error" in res) throw new Error(res.error);
    expect(res.changes.length).toBe(0);
  });

  it("returns Unauthorized for a non-owner", async () => {
    const other = await seedSeller();
    const listing = await seedReferencedListing(other.id);
    const res = await resyncReferencedListingAction(listing.id);
    expect("error" in res).toBe(true);
  });
});

// ─── Teemill outbound URLs (live-confirmed pattern) ───────────────────────────

describe("US-MFTF-13.4 — Teemill designer/editor URLs", () => {
  it("builds the generic designer URL scoped to the project id from the API key", () => {
    expect(teemillDesignerUrl()).toBe(EXPECTED_DESIGNER_URL);
  });

  it("builds a per-product editor deep-link from the stored slug + project id", () => {
    expect(teemillEditUrl({ slug: POWERED_BY_PLANTS_SLUG })).toBe(EXPECTED_EDIT_URL);
  });

  it("falls back to the generic designer URL when no slug is known", () => {
    expect(teemillEditUrl({})).toBe(EXPECTED_DESIGNER_URL);
    expect(teemillEditUrl({ slug: null })).toBe(EXPECTED_DESIGNER_URL);
  });
});

// ─── referencedListingCarousel (pure ordering) ────────────────────────────────

describe("US-MFTF-13.4 — referencedListingCarousel", () => {
  it("orders lifestyle photos first, then distinct mockups, deduped", () => {
    const result = referencedListingCarousel({
      lifestyle: [
        { displayUrl: "d1.jpg", originalUrl: "o1.jpg" },
        { displayUrl: null, originalUrl: "o2.jpg" },
      ],
      variants: [
        { mockupUrl: "m-green.jpg", colorName: "Evergreen" },
        { mockupUrl: "m-green.jpg", colorName: "Evergreen" }, // duplicate colour
        { mockupUrl: "m-brown.jpg", colorName: "Brown" },
        { mockupUrl: null, colorName: "NoMock" },
      ],
    });
    expect(result.map((r) => r.url)).toEqual(["d1.jpg", "o2.jpg", "m-green.jpg", "m-brown.jpg"]);
    expect(result[0]).toEqual({ url: "d1.jpg", kind: "lifestyle", label: null });
    expect(result[2]).toEqual({ url: "m-green.jpg", kind: "mockup", label: "Evergreen" });
  });

  it("returns an empty array when there are no images", () => {
    expect(referencedListingCarousel({ lifestyle: [], variants: [] })).toEqual([]);
  });

  it("falls back to mockups only when no lifestyle photos exist", () => {
    const result = referencedListingCarousel({
      lifestyle: [],
      variants: [{ mockupUrl: "m.jpg", colorName: "Black" }],
    });
    expect(result).toEqual([{ url: "m.jpg", kind: "mockup", label: "Black" }]);
  });
});

// ─── getReferencedListingForEdit ──────────────────────────────────────────────

describe("US-MFTF-13.4 — getReferencedListingForEdit", () => {
  let seller: Awaited<ReturnType<typeof seedSeller>>;
  beforeEach(async () => {
    await resetDatabase();
    seller = await seedSeller();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("returns Teemill-owned read-only data, merchandising, and an Edit-on-Teemill URL", async () => {
    const listing = await seedReferencedListing(seller.id);
    const data = await getReferencedListingForEdit(listing.id);
    expect(data).not.toBeNull();
    expect(data!.sourcingMode).toBe("REFERENCED");
    expect(data!.providerProductRef).toBe(POWERED_BY_PLANTS_PRODUCT_REF);
    expect(data!.colors.find((c) => c.colorName === "Evergreen")?.colorHex).toBe("#23312d");
    expect(data!.sizes.length).toBeGreaterThan(0);
    // Live-confirmed editor deep-link: /create-a-product/{slug}/?project={sub}.
    expect(data!.editOnTeemillUrl).toBe(EXPECTED_EDIT_URL);
    expect(Number(data!.retailPrice)).toBe(32);
  });

  it("exposes carouselImages: uploaded lifestyle photos first, then Teemill mockups", async () => {
    const listing = await seedReferencedListing(seller.id);
    // Add two lifestyle photos (one processed, one not).
    await prisma.apparelListingImage.create({
      data: {
        apparelListingId: listing.id,
        originalUrl: "https://blob/ls-a-orig.jpg",
        displayUrl: "https://blob/ls-a-display.jpg",
        isPrimary: true,
        sortOrder: 0,
      },
    });
    await prisma.apparelListingImage.create({
      data: {
        apparelListingId: listing.id,
        originalUrl: "https://blob/ls-b-orig.jpg",
        isPrimary: false,
        sortOrder: 1,
      },
    });

    const data = await getReferencedListingForEdit(listing.id);
    const carousel = data!.carouselImages;
    // Lifestyle first (display variant preferred, else original), in sort order.
    expect(carousel[0]).toEqual({
      url: "https://blob/ls-a-display.jpg",
      kind: "lifestyle",
      label: null,
    });
    expect(carousel[1]).toEqual({
      url: "https://blob/ls-b-orig.jpg",
      kind: "lifestyle",
      label: null,
    });
    // Mockups follow.
    const firstMockupIdx = carousel.findIndex((i) => i.kind === "mockup");
    expect(firstMockupIdx).toBe(2);
    expect(carousel.slice(firstMockupIdx).every((i) => i.kind === "mockup")).toBe(true);
    expect(carousel.some((i) => i.url.includes("podos.io"))).toBe(true);
  });

  it("returns null for a designed listing (wrong mode)", async () => {
    const pt = await prisma.productType.create({
      data: { name: `T ${crypto.randomUUID()}`, fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    const designed = await prisma.apparelListing.create({
      data: {
        sellerId: seller.id,
        productTypeId: pt.id,
        title: "Designed",
        retailPrice: 20,
        designImageUrl: "https://blob/d.png",
      },
    });
    const data = await getReferencedListingForEdit(designed.id);
    expect(data).toBeNull();
  });
});
