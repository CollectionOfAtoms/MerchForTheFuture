import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// Cookie wrapper mocked so the auth-callback wiring helper is testable.
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

const cookiesMock = await import("@/lib/cart/cookies");
const { mergeGuestCartIntoUser } = await import("@/lib/cart/cart");
const { mergeGuestCartOnAuth } = await import("@/lib/cart/merge");

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({ data: { email: `seller-${crypto.randomUUID()}@test.com`, roles: ["SELLER"] as never } });
}
async function seedBuyer() {
  return prisma.user.create({ data: { email: `buyer-${crypto.randomUUID()}@test.com`, roles: ["BUYER"] as never } });
}
async function seedApparel(sellerId: string, title = "Tee") {
  const pt = await prisma.productType.create({
    data: {
      name: `PT ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRODIGI",
      providerSkuBase: "RNA1",
      colors: { create: [{ colorName: "White", providerColorCode: "White" }] },
      sizes: { create: [{ sizeLabel: "M", providerSizeCode: "M", sortOrder: 1 }] },
    },
  });
  return prisma.apparelListing.create({
    data: { sellerId, sourcingMode: "DESIGNED", productTypeId: pt.id, title, retailPrice: 28, status: "ACTIVE", designImageUrl: "https://b/d.png" },
  });
}

async function guestCart(token: string, items: { apparelListingId: string; selection: object; quantity: number }[]) {
  return prisma.cart.create({
    data: {
      guestToken: token,
      items: { create: items.map((i) => ({ itemKind: "APPAREL", apparelListingId: i.apparelListingId, selection: i.selection as never, quantity: i.quantity })) },
    },
  });
}

// ─── Core merge ───────────────────────────────────────────────────────────────

describe("US-MFTF-11.5 — mergeGuestCartIntoUser", () => {
  beforeEach(async () => {
    await resetDatabase();
    mockGuestToken = null;
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("merges a guest cart into a user with no existing cart", async () => {
    const seller = await seedSeller();
    const buyer = await seedBuyer();
    const a = await seedApparel(seller.id);
    await guestCart("g-1", [{ apparelListingId: a.id, selection: { colorId: "White", sizeLabel: "M" }, quantity: 2 }]);

    await mergeGuestCartIntoUser("g-1", buyer.id);

    const userCart = await prisma.cart.findUnique({ where: { userId: buyer.id }, include: { items: true } });
    expect(userCart!.items).toHaveLength(1);
    expect(userCart!.items[0].quantity).toBe(2);
    expect(await prisma.cart.findUnique({ where: { guestToken: "g-1" } })).toBeNull();
  });

  it("sums quantities for overlapping identical lines and unions the rest", async () => {
    const seller = await seedSeller();
    const buyer = await seedBuyer();
    const a = await seedApparel(seller.id, "Bee");
    const b = await seedApparel(seller.id, "Sun");

    // User already has 1× (a, White, M) and 1× (b, White, M).
    await prisma.cart.create({
      data: {
        userId: buyer.id,
        items: {
          create: [
            { itemKind: "APPAREL", apparelListingId: a.id, selection: { colorId: "White", sizeLabel: "M" } as never, quantity: 1 },
            { itemKind: "APPAREL", apparelListingId: b.id, selection: { colorId: "White", sizeLabel: "M" } as never, quantity: 1 },
          ],
        },
      },
    });
    // Guest has 3× (a, White, M) [overlap] and 1× (a, White, S) [new].
    await guestCart("g-2", [
      { apparelListingId: a.id, selection: { colorId: "White", sizeLabel: "M" }, quantity: 3 },
      { apparelListingId: a.id, selection: { colorId: "White", sizeLabel: "S" }, quantity: 1 },
    ]);

    await mergeGuestCartIntoUser("g-2", buyer.id);

    const userCart = await prisma.cart.findUnique({ where: { userId: buyer.id }, include: { items: true } });
    // (a,M) = 1+3 = 4; (b,M) = 1; (a,S) = 1  → 3 distinct lines
    expect(userCart!.items).toHaveLength(3);
    const aM = userCart!.items.find((i) => i.apparelListingId === a.id && (i.selection as { sizeLabel: string }).sizeLabel === "M")!;
    expect(aM.quantity).toBe(4);
    expect(await prisma.cart.findUnique({ where: { guestToken: "g-2" } })).toBeNull();
  });

  it("is idempotent — replaying the merge does not duplicate items", async () => {
    const seller = await seedSeller();
    const buyer = await seedBuyer();
    const a = await seedApparel(seller.id);
    await guestCart("g-3", [{ apparelListingId: a.id, selection: { colorId: "White", sizeLabel: "M" }, quantity: 2 }]);

    await mergeGuestCartIntoUser("g-3", buyer.id);
    await mergeGuestCartIntoUser("g-3", buyer.id); // replay — guest cart already gone

    const userCart = await prisma.cart.findUnique({ where: { userId: buyer.id }, include: { items: true } });
    expect(userCart!.items).toHaveLength(1);
    expect(userCart!.items[0].quantity).toBe(2);
  });

  it("deletes an empty guest cart and is a no-op when the token is unknown", async () => {
    const buyer = await seedBuyer();
    await prisma.cart.create({ data: { guestToken: "g-empty" } });
    await mergeGuestCartIntoUser("g-empty", buyer.id);
    expect(await prisma.cart.findUnique({ where: { guestToken: "g-empty" } })).toBeNull();
    // Unknown token: no throw, no user cart created.
    await mergeGuestCartIntoUser("g-unknown", buyer.id);
    expect(await prisma.cart.findUnique({ where: { userId: buyer.id } })).toBeNull();
  });
});

// ─── Auth-callback wiring ─────────────────────────────────────────────────────

describe("US-MFTF-11.5 — mergeGuestCartOnAuth (wiring)", () => {
  beforeEach(async () => {
    await resetDatabase();
    mockGuestToken = null;
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("reads the guest cookie, merges, and clears the cookie", async () => {
    const seller = await seedSeller();
    const buyer = await seedBuyer();
    const a = await seedApparel(seller.id);
    await guestCart("g-cookie", [{ apparelListingId: a.id, selection: { colorId: "White", sizeLabel: "M" }, quantity: 1 }]);
    mockGuestToken = "g-cookie";

    await mergeGuestCartOnAuth(buyer.id);

    expect(cookiesMock.clearGuestToken).toHaveBeenCalledOnce();
    expect(mockGuestToken).toBeNull();
    const userCart = await prisma.cart.findUnique({ where: { userId: buyer.id }, include: { items: true } });
    expect(userCart!.items).toHaveLength(1);
    expect(await prisma.cart.findUnique({ where: { guestToken: "g-cookie" } })).toBeNull();
  });

  it("is a no-op when there is no guest cookie", async () => {
    const buyer = await seedBuyer();
    mockGuestToken = null;
    await mergeGuestCartOnAuth(buyer.id);
    expect(cookiesMock.clearGuestToken).not.toHaveBeenCalled();
    expect(await prisma.cart.findUnique({ where: { userId: buyer.id } })).toBeNull();
  });
});
