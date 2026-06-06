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

import { auth } from "@/auth";
import { createPrintOrder } from "@/lib/print/order";
import { fulfillPayment } from "@/lib/payments/webhook";

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
    expect(order.prodigiSku).toBe("GLOBAL-FAP-16x12");
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
    expect(order.prodigiOrderId).toBeTruthy();
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
        prodigiSku: "GLOBAL-FAP-16x12",
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
        prodigiSku: "GLOBAL-FAP-16x12",
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
