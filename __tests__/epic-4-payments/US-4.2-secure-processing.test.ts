import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { fulfillPayment } from "@/lib/payments/webhook";

describe("US-4.2 — Secure Payment Processing", () => {
  let orderId: string;
  let listingId: string;
  const paymentIntentId = "pi_test_fulfilled";

  beforeEach(async () => {
    await resetDatabase();

    const seller = await prisma.user.create({
      data: { email: "seller@test.com", passwordHash: "x", roles: ["SELLER"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", passwordHash: "x", roles: ["BUYER"] },
    });

    const artwork = await prisma.artwork.create({
      data: {
        sellerId: seller.id,
        title: "Secure Piece",
        description: "",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    const listing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: 300.0,
        currency: "USD",
        status: "ACTIVE",
      },
    });
    listingId = listing.id;

    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "ORIGINAL",
        originalListingId: listingId,
        subtotal: 300.0,
        taxAmount: 0,
        totalAmount: 300.0,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: paymentIntentId,
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("marks the order as PAID after a successful payment", async () => {
    await fulfillPayment(paymentIntentId);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe("PAID");
  });

  it("marks the listing as SOLD after a successful payment", async () => {
    await fulfillPayment(paymentIntentId);

    const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
    expect(listing?.status).toBe("SOLD");
  });

  it("creates a Transaction record with fee breakdown", async () => {
    await fulfillPayment(paymentIntentId);

    const tx = await prisma.transaction.findFirst({ where: { orderId } });
    expect(tx).not.toBeNull();
    expect(Number(tx!.grossAmount)).toBeCloseTo(300.0);
    // platform fee (10%) + stripe processing fee (~2.9% + 30¢)
    expect(Number(tx!.platformFee)).toBeGreaterThan(0);
    expect(Number(tx!.processingFee)).toBeGreaterThan(0);
    expect(Number(tx!.netPayout)).toBeLessThan(300.0);
  });

  it("raw card details are never stored on the platform", async () => {
    await fulfillPayment(paymentIntentId);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    // Only the paymentIntentId (a Stripe token reference) is stored, not card numbers
    expect(order).not.toHaveProperty("cardNumber");
    expect(order).not.toHaveProperty("cvv");
    expect(order?.stripePaymentIntentId).toBe(paymentIntentId);
  });

  it("is idempotent — fulfilling twice does not double-create transactions", async () => {
    await fulfillPayment(paymentIntentId);
    await fulfillPayment(paymentIntentId); // second call should be a no-op

    const txCount = await prisma.transaction.count({ where: { orderId } });
    expect(txCount).toBe(1);
  });

  it("throws if no order matches the paymentIntentId", async () => {
    await expect(fulfillPayment("pi_nonexistent")).rejects.toThrow(/not found/i);
  });
});
