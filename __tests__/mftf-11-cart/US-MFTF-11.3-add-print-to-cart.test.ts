import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockGuestToken: string | null = null;
vi.mock("@/lib/cart/cookies", () => ({
  GUEST_CART_COOKIE: "mftf_cart",
  getGuestToken: vi.fn(async () => mockGuestToken),
  setGuestToken: vi.fn(async (t: string) => {
    mockGuestToken = t;
  }),
  clearGuestToken: vi.fn(async () => {
    mockGuestToken = null;
  }),
  generateGuestToken: () => `guest-${crypto.randomUUID()}`,
}));

const { auth } = await import("@/auth");
const { addToCartAction } = await import("@/app/actions/cart");

// The buyer-facing cart snapshot must equal the seller-set printProducts price
// (the price shown on the artwork page), NOT a Prodigi fulfilment cost.
const PRINT_PRODUCTS = [
  { sku: "GLOBAL-FAP-16X24", size: "16x24", price: 45 },
  { sku: "GLOBAL-FAP-20X28", size: "20x28", price: 65 },
];

async function seedArtworkListing({
  availableForPrint = true,
  status = "ACTIVE" as "ACTIVE" | "SOLD" | "ARCHIVED" | "CANCELLED",
} = {}) {
  const seller = await prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, roles: ["SELLER"] as never },
  });
  const artwork = await prisma.artwork.create({
    data: { sellerId: seller.id, title: "Print Me", description: "D", status: "PUBLISHED", publishedAt: new Date() },
  });
  return prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: "FIXED_PRICE",
      price: 500,
      currency: "USD",
      status,
      availableForPrint,
      printSourceImageUrl: availableForPrint ? "https://cdn/source.jpg" : null,
      printProducts: availableForPrint ? (PRINT_PRODUCTS as never) : undefined,
    },
  });
}

describe("US-MFTF-11.3 — addToCartAction (print)", () => {
  beforeEach(async () => {
    await resetDatabase();
    mockGuestToken = null;
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(null as never);
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("rejects when prints are not enabled for the artwork", async () => {
    const listing = await seedArtworkListing({ availableForPrint: false });
    const result = await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-16X24" });
    expect(result).toHaveProperty("error");
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("rejects a SKU not in the listing's curated print products", async () => {
    const listing = await seedArtworkListing();
    const result = await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-99X99" });
    expect(result).toHaveProperty("error");
  });

  it("rejects an ARCHIVED artwork listing", async () => {
    const listing = await seedArtworkListing({ status: "ARCHIVED" });
    const result = await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-16X24" });
    expect(result).toHaveProperty("error");
  });

  it("adds a print to a guest cart snapshotting the seller's retail price (matches the artwork page)", async () => {
    const listing = await seedArtworkListing();
    const result = await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-16X24" });
    expect(result).toEqual({ success: true, count: 1 });

    const items = await prisma.cartItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].itemKind).toBe("PRINT");
    expect(items[0].listingId).toBe(listing.id);
    expect(items[0].apparelListingId).toBeNull();
    // Snapshot is the seller-set printProducts price (45) — the price the buyer
    // saw on the artwork page — not a Prodigi fulfilment cost.
    expect(items[0].selection).toEqual({
      prodigiSku: "GLOBAL-FAP-16X24",
      attributes: {},
      quotedUnitPrice: 45,
    });
  });

  it("snapshots each SKU's own seller price", async () => {
    const listing = await seedArtworkListing();
    await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-20X28" });
    const item = await prisma.cartItem.findFirst();
    expect((item!.selection as { quotedUnitPrice: number }).quotedUnitPrice).toBe(65);
  });

  it("increments quantity for an identical print (dedupes on SKU + attributes)", async () => {
    const listing = await seedArtworkListing();
    await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-16X24" });
    const result = await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-16X24" });
    expect(result).toEqual({ success: true, count: 2 });
    const items = await prisma.cartItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it("keeps distinct SKUs as separate lines", async () => {
    const listing = await seedArtworkListing();
    await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-16X24" });
    await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-20X28" });
    expect(await prisma.cartItem.count()).toBe(2);
  });

  it("attaches the print to a find-or-create user cart for an authenticated buyer", async () => {
    const buyer = await prisma.user.create({ data: { email: `buyer-${crypto.randomUUID()}@test.com`, roles: ["BUYER"] as never } });
    vi.mocked(auth).mockResolvedValue({ user: { id: buyer.id, roles: ["BUYER"] } } as never);
    const listing = await seedArtworkListing();
    const result = await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-16X24" });
    expect(result).toEqual({ success: true, count: 1 });
    const cart = await prisma.cart.findUnique({ where: { userId: buyer.id }, include: { items: true } });
    expect(cart!.items).toHaveLength(1);
  });

  it("does NOT create an Order (the direct single-item path is removed)", async () => {
    const listing = await seedArtworkListing();
    await addToCartAction({ itemKind: "PRINT", listingId: listing.id, prodigiSku: "GLOBAL-FAP-16X24" });
    expect(await prisma.order.count()).toBe(0);
  });
});
