import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Auth and the cookie wrapper are mocked; the cart core hits the real test DB.

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
const cookiesMock = await import("@/lib/cart/cookies");
const { addToCartAction } = await import("@/app/actions/cart");

function authAsUser(id: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id, roles: ["BUYER"] } } as never);
}
function authAsGuest() {
  vi.mocked(auth).mockResolvedValue(null as never);
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: ["SELLER"] as never },
  });
}

async function seedDesignedListing(
  sellerId: string,
  { status = "ACTIVE" as "ACTIVE" | "UNLISTED" | "ARCHIVED" | "SOLD", offeredColors = ["White", "Black"], unofferedColors = ["Red"], sizes = ["S", "M", "L"] } = {},
) {
  const pt = await prisma.productType.create({
    data: {
      name: `Unisex Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRODIGI",
      providerSkuBase: "RNA1",
      colors: {
        create: [...offeredColors, ...unofferedColors].map((c) => ({
          colorName: c,
          providerColorCode: c,
          colorImageUrl: `https://blob/swatch-${c}.png`,
        })),
      },
      sizes: { create: sizes.map((s, i) => ({ sizeLabel: s, providerSizeCode: s, sortOrder: i + 1 })) },
    },
    include: { colors: true },
  });
  const offered = new Set(offeredColors);
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "DESIGNED",
      productTypeId: pt.id,
      title: "Solar Punk Bee",
      retailPrice: 28,
      status,
      designImageUrl: "https://blob/design.png",
      colors: { create: pt.colors.map((c) => ({ productTypeColorId: c.id, isOffered: offered.has(c.colorName) })) },
    },
  });
  return listing;
}

async function seedReferencedListing(sellerId: string, { colors = ["Evergreen", "Stone"], sizes = ["S", "M"] } = {}) {
  return prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      title: "Powered By Plants",
      retailPrice: 32,
      status: "ACTIVE",
      providerKey: "teemill",
      providerProductRef: `ref-${crypto.randomUUID()}`,
      providerBaseCurrency: "GBP",
      providerBasePrice: 19,
      referencedVariants: {
        create: colors.flatMap((c) =>
          sizes.map((size) => ({
            variantRef: `https://api.teemill.com/v1/catalog/variants/${crypto.randomUUID()}`,
            colorName: c,
            colorHex: `#${c.length}${c.length}aabb`,
            sizeLabel: size,
            stockLevel: 5,
            isOrderable: true,
            mockupUrl: `https://images.podos.io/mockup-${c}.jpg`,
          })),
        ),
      },
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-MFTF-11.2 — addToCartAction (apparel)", () => {
  beforeEach(() => {
    mockGuestToken = null;
    vi.clearAllMocks();
    authAsGuest();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  // ── Validation ──
  it("rejects an UNLISTED listing (previewable but not purchasable)", async () => {
    const seller = await seedSeller();
    const listing = await seedDesignedListing(seller.id, { status: "UNLISTED" });
    const result = await addToCartAction({
      itemKind: "APPAREL",
      apparelListingId: listing.id,
      selection: { colorId: "White", sizeLabel: "M" },
    });
    expect(result).toHaveProperty("error");
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("rejects an ARCHIVED listing", async () => {
    const seller = await seedSeller();
    const listing = await seedDesignedListing(seller.id, { status: "ARCHIVED" });
    const result = await addToCartAction({
      itemKind: "APPAREL",
      apparelListingId: listing.id,
      selection: { colorId: "White", sizeLabel: "M" },
    });
    expect(result).toHaveProperty("error");
  });

  it("rejects a colour that is not offered on the listing", async () => {
    const seller = await seedSeller();
    const listing = await seedDesignedListing(seller.id, { offeredColors: ["White"], unofferedColors: ["Red"] });
    const result = await addToCartAction({
      itemKind: "APPAREL",
      apparelListingId: listing.id,
      selection: { colorId: "Red", sizeLabel: "M" },
    });
    expect(result).toHaveProperty("error");
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("rejects a size that is not valid for the product type", async () => {
    const seller = await seedSeller();
    const listing = await seedDesignedListing(seller.id, { sizes: ["S", "M"] });
    const result = await addToCartAction({
      itemKind: "APPAREL",
      apparelListingId: listing.id,
      selection: { colorId: "White", sizeLabel: "XXL" },
    });
    expect(result).toHaveProperty("error");
  });

  it("rejects a malformed selection", async () => {
    const seller = await seedSeller();
    const listing = await seedDesignedListing(seller.id);
    const result = await addToCartAction({
      itemKind: "APPAREL",
      apparelListingId: listing.id,
      selection: { colorId: "White" } as never,
    });
    expect(result).toHaveProperty("error");
  });

  // ── Guest cart ──
  it("creates a guest cart + item and sets a cookie token on first add", async () => {
    const seller = await seedSeller();
    const listing = await seedDesignedListing(seller.id);
    const result = await addToCartAction({
      itemKind: "APPAREL",
      apparelListingId: listing.id,
      selection: { colorId: "White", sizeLabel: "M" },
    });
    expect(result).toEqual({ success: true, count: 1 });
    expect(cookiesMock.setGuestToken).toHaveBeenCalledOnce();
    const cart = await prisma.cart.findFirst({ where: { guestToken: mockGuestToken! }, include: { items: true } });
    expect(cart).not.toBeNull();
    expect(cart!.userId).toBeNull();
    expect(cart!.items).toHaveLength(1);
    expect(cart!.items[0].selection).toEqual({ colorId: "White", sizeLabel: "M" });
  });

  it("reuses the existing guest cookie token on a second add (no new cookie)", async () => {
    const seller = await seedSeller();
    const listing = await seedDesignedListing(seller.id);
    await addToCartAction({ itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "White", sizeLabel: "M" } });
    vi.mocked(cookiesMock.setGuestToken).mockClear();
    await addToCartAction({ itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "Black", sizeLabel: "S" } });
    expect(cookiesMock.setGuestToken).not.toHaveBeenCalled();
    const carts = await prisma.cart.findMany({ include: { items: true } });
    expect(carts).toHaveLength(1);
    expect(carts[0].items).toHaveLength(2);
  });

  it("increments quantity when an identical selection is added again", async () => {
    const seller = await seedSeller();
    const listing = await seedDesignedListing(seller.id);
    await addToCartAction({ itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "White", sizeLabel: "M" } });
    const result = await addToCartAction({ itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "White", sizeLabel: "M" } });
    expect(result).toEqual({ success: true, count: 2 });
    const items = await prisma.cartItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  // ── Authenticated cart ──
  it("attaches the item to a find-or-create user cart for an authenticated buyer", async () => {
    const seller = await seedSeller();
    const buyer = await prisma.user.create({ data: { email: `buyer-${crypto.randomUUID()}@test.com`, roles: ["BUYER"] as never } });
    authAsUser(buyer.id);
    const listing = await seedDesignedListing(seller.id);
    const result = await addToCartAction({ itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "White", sizeLabel: "M" } });
    expect(result).toEqual({ success: true, count: 1 });
    expect(cookiesMock.setGuestToken).not.toHaveBeenCalled();
    const cart = await prisma.cart.findUnique({ where: { userId: buyer.id }, include: { items: true } });
    expect(cart).not.toBeNull();
    expect(cart!.items).toHaveLength(1);
  });

  // ── Referenced (Teemill) mode validates against the same normalized read-shape ──
  it("accepts a valid referenced-listing colour/size (no mode branching)", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id, { colors: ["Evergreen", "Stone"], sizes: ["S", "M"] });
    const result = await addToCartAction({ itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "Evergreen", sizeLabel: "M" } });
    expect(result).toEqual({ success: true, count: 1 });
  });

  it("rejects a colour absent from a referenced listing's variants", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id, { colors: ["Evergreen"], sizes: ["S"] });
    const result = await addToCartAction({ itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "Crimson", sizeLabel: "S" } });
    expect(result).toHaveProperty("error");
  });
});
