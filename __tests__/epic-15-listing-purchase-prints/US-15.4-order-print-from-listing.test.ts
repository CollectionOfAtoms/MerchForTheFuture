import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// US-MFTF-11.3 reworked the listing-page print flow into add-to-cart. The guest
// cart cookie wrapper is mocked so the add-to-cart action is exercisable here.
let mockGuestToken: string | null = null;
vi.mock("@/lib/cart/cookies", () => ({
  GUEST_CART_COOKIE: "mftf_cart",
  getGuestToken: vi.fn(async () => mockGuestToken),
  setGuestToken: vi.fn(async (t: string) => { mockGuestToken = t; }),
  clearGuestToken: vi.fn(async () => { mockGuestToken = null; }),
  generateGuestToken: () => `guest-${crypto.randomUUID()}`,
}));

import { auth } from "@/auth";
import { createPrintOrder } from "@/lib/print/order";
import { fulfillPayment } from "@/lib/payments/webhook";
import { addToCartAction } from "@/app/actions/cart";

describe("US-15.4 — Order a Print from Listing Page", () => {
  let sellerId: string;
  let buyerId: string;
  let listingId: string;

  const printConfig = {
    availableForPrint: true,
    printSourceImageUrl: "https://cdn.example.com/source.jpg",
    printProducts: [
      { sku: "GLOBAL-FAP-16x12", size: "16x12", price: 45 },
      { sku: "GLOBAL-FAP-20x16", size: "20x16", price: 65 },
    ],
  };

  beforeEach(async () => {
    await resetDatabase();
    vi.resetAllMocks();

    const seller = await prisma.user.create({
      data: { email: "seller154@test.com", name: "Print Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;

    const buyer = await prisma.user.create({
      data: { email: "buyer154@test.com", name: "Print Buyer", passwordHash: "hash", roles: ["BUYER"] },
    });
    buyerId = buyer.id;

    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Print Me", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://cdn.example.com/art.jpg", isPrimary: true, order: 0 },
    });
    const listing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: 500,
        currency: "USD",
        ...printConfig,
        printProducts: printConfig.printProducts as never,
      },
    });
    listingId = listing.id;
  });

  // ── createPrintOrder ───────────────────────────────────────────────────────

  it("creates a PENDING print order when shipping is omitted", async () => {
    const order = await createPrintOrder({
      buyerId,
      originalListingId: listingId,
      sku: "GLOBAL-FAP-16x12",
      size: "16x12",
      quantity: 1,
    });
    expect(order.listingType).toBe("PRINT");
    expect(order.originalListingId).toBe(listingId);
    expect(order.externalSku).toBe("GLOBAL-FAP-16x12");
    expect(Number(order.subtotal)).toBe(45);
    expect(order.status).toBe("PENDING");
  });

  it("creates a PROCESSING print order with Prodigi ID when shipping is provided", async () => {
    const order = await createPrintOrder({
      buyerId,
      originalListingId: listingId,
      sku: "GLOBAL-FAP-16x12",
      size: "16x12",
      quantity: 1,
      shipping: {
        name: "Test Buyer",
        line1: "123 Main St",
        city: "Portland",
        state: "OR",
        postal: "97201",
        country: "US",
      },
    });
    expect(order.status).toBe("PROCESSING");
    expect(order.externalOrderId).toBeTruthy();
  });

  it("rejects invalid SKU not in listing printProducts", async () => {
    await expect(
      createPrintOrder({
        buyerId,
        originalListingId: listingId,
        sku: "INVALID-SKU-XYZ",
        size: "16x12",
        quantity: 1,
      })
    ).rejects.toThrow(/sku|product/i);
  });

  it("rejects if listing does not have availableForPrint enabled", async () => {
    const artwork2 = await prisma.artwork.create({
      data: { sellerId, title: "No Print", description: "D", status: "PUBLISHED" },
    });
    const noprint = await prisma.originalListing.create({
      data: { artworkId: artwork2.id, saleType: "FIXED_PRICE", price: 300, currency: "USD" },
    });
    await expect(
      createPrintOrder({ buyerId, originalListingId: noprint.id, sku: "GLOBAL-FAP-16x12", size: "16x12", quantity: 1 })
    ).rejects.toThrow(/print/i);
  });

  it("calculates subtotal from product price × quantity", async () => {
    const order = await createPrintOrder({
      buyerId,
      originalListingId: listingId,
      sku: "GLOBAL-FAP-20x16",
      size: "20x16",
      quantity: 3,
    });
    expect(Number(order.subtotal)).toBe(65 * 3);
    expect(Number(order.totalAmount)).toBe(65 * 3);
  });

  // ── fulfillPayment — PRINT order handling ─────────────────────────────────

  it("does NOT mark the originalListing as SOLD for a PRINT payment", async () => {
    const order = await prisma.order.create({
      data: {
        buyerId,
        listingType: "PRINT",
        originalListingId: listingId,
        externalSku: "GLOBAL-FAP-16x12",
        subtotal: 45,
        taxAmount: 0,
        totalAmount: 45,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: "pi_print_test_001",
      },
    });

    await fulfillPayment("pi_print_test_001");

    const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
    expect(listing!.status).toBe("ACTIVE");
  });

  it("marks the PRINT order as PAID (or PROCESSING) after fulfillPayment", async () => {
    await prisma.order.create({
      data: {
        buyerId,
        listingType: "PRINT",
        originalListingId: listingId,
        externalSku: "GLOBAL-FAP-16x12",
        subtotal: 45,
        taxAmount: 0,
        totalAmount: 45,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: "pi_print_test_002",
      },
    });

    await fulfillPayment("pi_print_test_002");

    const updated = await prisma.order.findFirst({ where: { stripePaymentIntentId: "pi_print_test_002" } });
    expect(["PAID", "PROCESSING"]).toContain(updated!.status);
  });

  it("print order appears in buyer order history by listingType PRINT", async () => {
    const order = await createPrintOrder({
      buyerId,
      originalListingId: listingId,
      sku: "GLOBAL-FAP-16x12",
      size: "16x12",
      quantity: 1,
    });

    const buyerOrders = await prisma.order.findMany({
      where: { buyerId, listingType: "PRINT" },
    });
    expect(buyerOrders).toHaveLength(1);
    expect(buyerOrders[0].id).toBe(order.id);
  });
});

// ── US-MFTF-11.3 rework: the listing-page print flow now ends in add-to-cart ──
// The direct single-item order path (createPrintOrderAction → /checkout/{id}) was
// removed; PrintOptionsSelector now calls addToCartAction. The createPrintOrder
// lib above is retained (it is the underlying order creator used by checkout /
// fulfillment), so the tests above continue to pass unchanged.
describe("US-15.4 → US-MFTF-11.3 — Add a print to the cart from the listing page", () => {
  let listingId: string;

  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    mockGuestToken = null;
    vi.mocked(auth).mockResolvedValue(null as never); // guest

    const seller = await prisma.user.create({
      data: { email: `seller-${crypto.randomUUID()}@test.com`, roles: ["SELLER"] as never },
    });
    const artwork = await prisma.artwork.create({
      data: { sellerId: seller.id, title: "Print Me", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    const listing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: 500,
        currency: "USD",
        availableForPrint: true,
        printSourceImageUrl: "https://cdn.example.com/source.jpg",
        printProducts: [
          { sku: "GLOBAL-FAP-16x12", size: "16x12", price: 45 },
          { sku: "GLOBAL-FAP-20x16", size: "20x16", price: 65 },
        ] as never,
      },
    });
    listingId = listing.id;
  });

  it("adds a PRINT cart item with a quoted snapshot instead of creating an order", async () => {
    const result = await addToCartAction({ itemKind: "PRINT", listingId, prodigiSku: "GLOBAL-FAP-16x12" });
    expect(result).toEqual({ success: true, count: 1 });

    const items = await prisma.cartItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].itemKind).toBe("PRINT");
    expect(items[0].listingId).toBe(listingId);
    expect((items[0].selection as { prodigiSku: string }).prodigiSku).toBe("GLOBAL-FAP-16x12");
    // Cart snapshot = seller's printProducts price (45), matching the page.
    expect((items[0].selection as { quotedUnitPrice: number }).quotedUnitPrice).toBe(45);

    // The page flow no longer creates a direct single-item order.
    expect(await prisma.order.count()).toBe(0);
  });
});
