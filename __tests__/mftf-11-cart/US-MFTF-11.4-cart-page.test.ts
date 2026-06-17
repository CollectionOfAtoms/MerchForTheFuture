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
const { getCartView } = await import("@/lib/cart/cart");
const { updateCartItemAction, removeCartItemAction } = await import("@/app/actions/cart");

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({ data: { email: `seller-${crypto.randomUUID()}@test.com`, roles: ["SELLER"] as never } });
}

async function seedApparel(sellerId: string) {
  const pt = await prisma.productType.create({
    data: {
      name: `Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRODIGI",
      providerSkuBase: "RNA1",
      colors: { create: [{ colorName: "White", providerColorCode: "White" }] },
      sizes: { create: [{ sizeLabel: "M", providerSizeCode: "M", sortOrder: 1 }] },
    },
  });
  return prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "DESIGNED",
      productTypeId: pt.id,
      title: "Solar Punk Bee",
      retailPrice: 28,
      status: "ACTIVE",
      designImageUrl: "https://blob/d.png",
      images: { create: [{ originalUrl: "https://blob/o.jpg", gridUrl: "https://blob/grid.jpg", isPrimary: true, sortOrder: 0 }] },
    },
  });
}

async function seedArtwork(sellerId: string) {
  const artwork = await prisma.artwork.create({
    data: { sellerId, title: "Print Me", description: "D", status: "PUBLISHED", publishedAt: new Date() },
  });
  await prisma.artworkImage.create({ data: { artworkId: artwork.id, url: "https://blob/art.jpg", gridUrl: "https://blob/art-grid.jpg", isPrimary: true, order: 0 } });
  return prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 500, currency: "USD", availableForPrint: true },
  });
}

async function guestCartWithItems(sellerId: string) {
  const apparel = await seedApparel(sellerId);
  const listing = await seedArtwork(sellerId);
  return prisma.cart.create({
    data: {
      guestToken: `guest-${crypto.randomUUID()}`,
      items: {
        create: [
          { itemKind: "APPAREL", apparelListingId: apparel.id, selection: { colorId: "White", sizeLabel: "M" }, quantity: 2 },
          { itemKind: "PRINT", listingId: listing.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 42 }, quantity: 1 },
        ],
      },
    },
    include: { items: true },
  });
}

// ─── getCartView ──────────────────────────────────────────────────────────────

describe("US-MFTF-11.4 — getCartView", () => {
  beforeEach(async () => {
    await resetDatabase();
    mockGuestToken = null;
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(null as never);
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("projects apparel + print line items with summaries, unit prices, totals, and subtotal", async () => {
    const seller = await seedSeller();
    const cart = await guestCartWithItems(seller.id);
    const view = await getCartView(cart.id);

    expect(view.itemCount).toBe(3); // 2 apparel + 1 print
    const apparel = view.items.find((i) => i.kind === "APPAREL")!;
    expect(apparel.title).toBe("Solar Punk Bee");
    expect(apparel.selectionSummary).toBe("White · M");
    expect(apparel.unitPrice).toBe(28);
    expect(apparel.lineTotal).toBe(56);
    expect(apparel.thumbnailUrl).toBe("https://blob/grid.jpg");

    const print = view.items.find((i) => i.kind === "PRINT")!;
    expect(print.title).toBe("Print Me");
    expect(print.selectionSummary).toBe("Fine Art Paper · 16x24");
    expect(print.unitPrice).toBe(42);
    expect(print.lineTotal).toBe(42);
    expect(print.thumbnailUrl).toBe("https://blob/art-grid.jpg");

    expect(view.subtotal).toBe(98); // 56 + 42
  });

  it("returns an empty view for a cart with no items", async () => {
    const cart = await prisma.cart.create({ data: { guestToken: `guest-${crypto.randomUUID()}` } });
    const view = await getCartView(cart.id);
    expect(view.items).toHaveLength(0);
    expect(view.subtotal).toBe(0);
    expect(view.itemCount).toBe(0);
  });
});

// ─── update / remove with ownership guards ──────────────────────────────────

describe("US-MFTF-11.4 — updateCartItemAction / removeCartItemAction", () => {
  beforeEach(async () => {
    await resetDatabase();
    mockGuestToken = null;
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(null as never);
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("updates a line quantity for the owning guest", async () => {
    const seller = await seedSeller();
    const cart = await guestCartWithItems(seller.id);
    mockGuestToken = cart.guestToken; // visitor owns this cart
    const apparelItem = cart.items.find((i) => i.itemKind === "APPAREL")!;

    const result = await updateCartItemAction(apparelItem.id, 5);
    expect(result).toEqual({ success: true, count: 6 }); // 5 apparel + 1 print
    const updated = await prisma.cartItem.findUnique({ where: { id: apparelItem.id } });
    expect(updated!.quantity).toBe(5);
  });

  it("rejects a quantity below 1", async () => {
    const seller = await seedSeller();
    const cart = await guestCartWithItems(seller.id);
    mockGuestToken = cart.guestToken;
    const item = cart.items[0];
    const result = await updateCartItemAction(item.id, 0);
    expect(result).toHaveProperty("error");
  });

  it("removes a line for the owning guest", async () => {
    const seller = await seedSeller();
    const cart = await guestCartWithItems(seller.id);
    mockGuestToken = cart.guestToken;
    const item = cart.items[0];
    const result = await removeCartItemAction(item.id);
    expect(result).toHaveProperty("success");
    expect(await prisma.cartItem.findUnique({ where: { id: item.id } })).toBeNull();
  });

  it("rejects manipulating an item in a cart the visitor does not own (ownership guard)", async () => {
    const seller = await seedSeller();
    const victimCart = await guestCartWithItems(seller.id);
    const victimItem = victimCart.items[0];

    // Attacker presents a *different* guest token.
    mockGuestToken = `guest-${crypto.randomUUID()}`;

    const update = await updateCartItemAction(victimItem.id, 9);
    expect(update).toHaveProperty("error");
    const remove = await removeCartItemAction(victimItem.id);
    expect(remove).toHaveProperty("error");

    // Victim's item is untouched.
    const stillThere = await prisma.cartItem.findUnique({ where: { id: victimItem.id } });
    expect(stillThere!.quantity).toBe(victimItem.quantity);
  });

  it("rejects when the visitor has no cart at all", async () => {
    const seller = await seedSeller();
    const cart = await guestCartWithItems(seller.id);
    const item = cart.items[0];
    mockGuestToken = null; // no cookie

    const result = await updateCartItemAction(item.id, 3);
    expect(result).toHaveProperty("error");
  });
});
