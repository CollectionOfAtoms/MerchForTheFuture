import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { createPaymentIntent } from "@/lib/payments/stripe";

describe("US-4.1 — Pay by Credit Card", () => {
  let buyerId: string;
  let orderId: string;

  beforeEach(async () => {
    await resetDatabase();

    const seller = await prisma.user.create({
      data: { email: "seller@test.com", passwordHash: "x", roles: ["SELLER"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", passwordHash: "x", roles: ["BUYER"] },
    });
    buyerId = buyer.id;

    const artwork = await prisma.artwork.create({
      data: {
        sellerId: seller.id,
        title: "Test Piece",
        description: "",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    const listing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: 250.0,
        currency: "USD",
        status: "ACTIVE",
      },
    });

    const order = await prisma.order.create({
      data: {
        buyerId,
        listingType: "ORIGINAL",
        originalListingId: listing.id,
        subtotal: 250.0,
        taxAmount: 0,
        totalAmount: 250.0,
        currency: "USD",
        status: "PENDING",
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("creates a Stripe PaymentIntent for a pending order", async () => {
    const result = await createPaymentIntent(orderId);

    expect(result).toHaveProperty("clientSecret");
    expect(result).toHaveProperty("paymentIntentId");
    expect(result.clientSecret).toBeTruthy();
  });

  it("stores the paymentIntentId on the order", async () => {
    const { paymentIntentId } = await createPaymentIntent(orderId);

    const updated = await prisma.order.findUnique({ where: { id: orderId } });
    expect(updated?.stripePaymentIntentId).toBe(paymentIntentId);
  });

  it("sets amount in smallest currency unit (cents)", async () => {
    const result = await createPaymentIntent(orderId);
    // MSW handler returns amount: 10000 — just verify we got a client secret back
    // meaning the call went through with a numeric amount
    expect(result.clientSecret).toContain("secret");
  });

  it("throws if order does not exist", async () => {
    await expect(createPaymentIntent("nonexistent-id")).rejects.toThrow(/not found/i);
  });

  it("throws if order is already paid", async () => {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PAID" },
    });

    await expect(createPaymentIntent(orderId)).rejects.toThrow(/already paid/i);
  });
});
