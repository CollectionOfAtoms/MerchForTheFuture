import { describe, it, expect, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import {
  validateCartOwnerInvariant,
  validateCartItemInvariant,
} from "@/lib/cart/invariants";
import {
  validateApparelSelection,
  validatePrintSelection,
  validateSelection,
} from "@/lib/cart/validators";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: ["SELLER"] as never },
  });
}

async function seedApparelListing(sellerId: string) {
  const pt = await prisma.productType.create({
    data: {
      name: `Unisex Tee ${crypto.randomUUID()}`,
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
      designImageUrl: "https://blob/design.png",
    },
  });
}

async function seedArtworkListing(sellerId: string) {
  const artwork = await prisma.artwork.create({
    data: { sellerId, title: "Print Me", description: "D", status: "PUBLISHED", publishedAt: new Date() },
  });
  return prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: "FIXED_PRICE",
      price: 500,
      currency: "USD",
      availableForPrint: true,
      printSourceImageUrl: "https://cdn/source.jpg",
      printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price: 45 }] as never,
    },
  });
}

// ─── Schema round-trip ────────────────────────────────────────────────────────

describe("US-MFTF-11.1 — Cart & CartItem schema", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it("creates a guest cart with an apparel item and round-trips relations", async () => {
    const seller = await seedSeller();
    const apparel = await seedApparelListing(seller.id);

    const cart = await prisma.cart.create({
      data: {
        guestToken: `guest-${crypto.randomUUID()}`,
        items: {
          create: {
            itemKind: "APPAREL",
            apparelListingId: apparel.id,
            selection: { colorId: "White", sizeLabel: "M" },
            quantity: 2,
          },
        },
      },
      include: { items: true },
    });

    expect(cart.userId).toBeNull();
    expect(cart.guestToken).toBeTruthy();
    expect(cart.items).toHaveLength(1);
    const item = cart.items[0];
    expect(item.itemKind).toBe("APPAREL");
    expect(item.apparelListingId).toBe(apparel.id);
    expect(item.listingId).toBeNull();
    expect(item.quantity).toBe(2);
    expect(item.selection).toEqual({ colorId: "White", sizeLabel: "M" });
  });

  it("creates a user cart with a print item and round-trips relations", async () => {
    const seller = await seedSeller();
    const buyer = await prisma.user.create({
      data: { email: `buyer-${crypto.randomUUID()}@test.com`, roles: ["BUYER"] as never },
    });
    const listing = await seedArtworkListing(seller.id);

    const cart = await prisma.cart.create({
      data: {
        userId: buyer.id,
        items: {
          create: {
            itemKind: "PRINT",
            listingId: listing.id,
            selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 45 },
            quantity: 1,
          },
        },
      },
      include: { items: { include: { originalListing: true } } },
    });

    expect(cart.userId).toBe(buyer.id);
    expect(cart.guestToken).toBeNull();
    expect(cart.items[0].itemKind).toBe("PRINT");
    expect(cart.items[0].listingId).toBe(listing.id);
    expect(cart.items[0].apparelListingId).toBeNull();
    expect(cart.items[0].originalListing?.id).toBe(listing.id);
  });

  it("enforces a unique userId per cart", async () => {
    const buyer = await prisma.user.create({
      data: { email: `buyer-${crypto.randomUUID()}@test.com`, roles: ["BUYER"] as never },
    });
    await prisma.cart.create({ data: { userId: buyer.id } });
    await expect(prisma.cart.create({ data: { userId: buyer.id } })).rejects.toThrow();
  });

  it("enforces a unique guestToken per cart", async () => {
    const token = `guest-${crypto.randomUUID()}`;
    await prisma.cart.create({ data: { guestToken: token } });
    await expect(prisma.cart.create({ data: { guestToken: token } })).rejects.toThrow();
  });

  it("cascade-deletes cart items when the cart is deleted", async () => {
    const seller = await seedSeller();
    const apparel = await seedApparelListing(seller.id);
    const cart = await prisma.cart.create({
      data: {
        guestToken: `guest-${crypto.randomUUID()}`,
        items: {
          create: { itemKind: "APPAREL", apparelListingId: apparel.id, selection: { colorId: "White", sizeLabel: "M" } },
        },
      },
      include: { items: true },
    });
    await prisma.cart.delete({ where: { id: cart.id } });
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
  });

  it("defaults quantity to 1", async () => {
    const seller = await seedSeller();
    const apparel = await seedApparelListing(seller.id);
    const cart = await prisma.cart.create({
      data: {
        guestToken: `guest-${crypto.randomUUID()}`,
        items: { create: { itemKind: "APPAREL", apparelListingId: apparel.id, selection: { colorId: "White", sizeLabel: "M" } } },
      },
      include: { items: true },
    });
    expect(cart.items[0].quantity).toBe(1);
  });
});

// ─── Owner invariant ──────────────────────────────────────────────────────────

describe("validateCartOwnerInvariant", () => {
  it("accepts a user-only cart", () => {
    expect(validateCartOwnerInvariant({ userId: "u1", guestToken: null }).valid).toBe(true);
  });
  it("accepts a guest-only cart", () => {
    expect(validateCartOwnerInvariant({ userId: null, guestToken: "g1" }).valid).toBe(true);
  });
  it("rejects a cart with neither owner", () => {
    expect(validateCartOwnerInvariant({ userId: null, guestToken: null }).valid).toBe(false);
  });
  it("rejects a cart with both owners", () => {
    expect(validateCartOwnerInvariant({ userId: "u1", guestToken: "g1" }).valid).toBe(false);
  });
});

// ─── Item invariant ───────────────────────────────────────────────────────────

describe("validateCartItemInvariant", () => {
  it("accepts an APPAREL item referencing an apparel listing", () => {
    expect(
      validateCartItemInvariant({ itemKind: "APPAREL", apparelListingId: "a1", listingId: null, quantity: 1 }).valid,
    ).toBe(true);
  });
  it("accepts a PRINT item referencing an artwork listing", () => {
    expect(
      validateCartItemInvariant({ itemKind: "PRINT", apparelListingId: null, listingId: "l1", quantity: 1 }).valid,
    ).toBe(true);
  });
  it("rejects an item with both references set", () => {
    expect(
      validateCartItemInvariant({ itemKind: "APPAREL", apparelListingId: "a1", listingId: "l1", quantity: 1 }).valid,
    ).toBe(false);
  });
  it("rejects an item with no reference set", () => {
    expect(
      validateCartItemInvariant({ itemKind: "APPAREL", apparelListingId: null, listingId: null, quantity: 1 }).valid,
    ).toBe(false);
  });
  it("rejects an APPAREL kind that references the artwork listing", () => {
    expect(
      validateCartItemInvariant({ itemKind: "APPAREL", apparelListingId: null, listingId: "l1", quantity: 1 }).valid,
    ).toBe(false);
  });
  it("rejects a PRINT kind that references the apparel listing", () => {
    expect(
      validateCartItemInvariant({ itemKind: "PRINT", apparelListingId: "a1", listingId: null, quantity: 1 }).valid,
    ).toBe(false);
  });
  it("rejects quantity below 1", () => {
    expect(
      validateCartItemInvariant({ itemKind: "APPAREL", apparelListingId: "a1", listingId: null, quantity: 0 }).valid,
    ).toBe(false);
  });
  it("rejects a non-integer quantity", () => {
    expect(
      validateCartItemInvariant({ itemKind: "APPAREL", apparelListingId: "a1", listingId: null, quantity: 1.5 }).valid,
    ).toBe(false);
  });
});

// ─── Selection validators ─────────────────────────────────────────────────────

describe("validateApparelSelection", () => {
  it("accepts a well-formed apparel selection", () => {
    const r = validateApparelSelection({ colorId: "White", sizeLabel: "M" });
    expect(r).toEqual({ valid: true, value: { colorId: "White", sizeLabel: "M" } });
  });
  it("rejects a missing colorId", () => {
    expect(validateApparelSelection({ sizeLabel: "M" }).valid).toBe(false);
  });
  it("rejects a missing sizeLabel", () => {
    expect(validateApparelSelection({ colorId: "White" }).valid).toBe(false);
  });
  it("rejects unknown keys", () => {
    expect(validateApparelSelection({ colorId: "White", sizeLabel: "M", prodigiSku: "x" }).valid).toBe(false);
  });
  it("rejects a non-object", () => {
    expect(validateApparelSelection("White/M").valid).toBe(false);
  });
});

describe("validatePrintSelection", () => {
  it("accepts a well-formed print selection", () => {
    const r = validatePrintSelection({ prodigiSku: "GLOBAL-FAP-16X24", attributes: { wrap: "White" }, quotedUnitPrice: 45 });
    expect(r.valid).toBe(true);
  });
  it("accepts empty attributes", () => {
    expect(validatePrintSelection({ prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 45 }).valid).toBe(true);
  });
  it("rejects a missing prodigiSku", () => {
    expect(validatePrintSelection({ attributes: {}, quotedUnitPrice: 45 }).valid).toBe(false);
  });
  it("rejects non-string attribute values", () => {
    expect(validatePrintSelection({ prodigiSku: "x", attributes: { wrap: 1 }, quotedUnitPrice: 45 }).valid).toBe(false);
  });
  it("rejects a missing or negative quotedUnitPrice", () => {
    expect(validatePrintSelection({ prodigiSku: "x", attributes: {} }).valid).toBe(false);
    expect(validatePrintSelection({ prodigiSku: "x", attributes: {}, quotedUnitPrice: -1 }).valid).toBe(false);
  });
  it("rejects unknown keys", () => {
    expect(validatePrintSelection({ prodigiSku: "x", attributes: {}, quotedUnitPrice: 45, colorId: "y" }).valid).toBe(false);
  });
});

describe("validateSelection dispatch", () => {
  it("routes APPAREL to the apparel validator", () => {
    expect(validateSelection("APPAREL", { colorId: "White", sizeLabel: "M" }).valid).toBe(true);
    expect(validateSelection("APPAREL", { prodigiSku: "x", attributes: {}, quotedUnitPrice: 1 }).valid).toBe(false);
  });
  it("routes PRINT to the print validator", () => {
    expect(validateSelection("PRINT", { prodigiSku: "x", attributes: {}, quotedUnitPrice: 1 }).valid).toBe(true);
    expect(validateSelection("PRINT", { colorId: "White", sizeLabel: "M" }).valid).toBe(false);
  });
});
