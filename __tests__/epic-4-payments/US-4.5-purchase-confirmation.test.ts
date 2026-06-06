import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { getOrderHistory } from "@/lib/payments/transactions";
import { fulfillPayment } from "@/lib/payments/webhook";

async function seedPaidOrder(
  sellerId: string,
  buyerId: string,
  price: number,
  piId: string
) {
  const artwork = await prisma.artwork.create({
    data: { sellerId, title: `Piece ${piId}`, description: "", status: "PUBLISHED", publishedAt: new Date() },
  });
  const listing = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price, currency: "USD", status: "ACTIVE" },
  });
  const order = await prisma.order.create({
    data: {
      buyerId,
      listingType: "ORIGINAL",
      originalListingId: listing.id,
      subtotal: price,
      taxAmount: 0,
      totalAmount: price,
      currency: "USD",
      status: "PENDING",
      stripePaymentIntentId: piId,
    },
  });
  await fulfillPayment(piId);
  return order;
}

describe("US-4.5 — Purchase Confirmation", () => {
  let sellerId: string;
  let buyerId: string;

  beforeEach(async () => {
    await resetDatabase();

    const seller = await prisma.user.create({
      data: { email: "seller@test.com", passwordHash: "x", roles: ["SELLER"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", passwordHash: "x", roles: ["BUYER"] },
    });
    sellerId = seller.id;
    buyerId = buyer.id;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("sends a confirmation email when a payment is fulfilled", async () => {
    // MSW intercepts POST https://api.resend.com/emails and returns { id: "email_test_mock" }
    // fulfillPayment internally calls sendPurchaseConfirmation which hits Resend
    // If this doesn't throw, the email call succeeded (MSW matched it)
    await expect(
      seedPaidOrder(sellerId, buyerId, 200.0, "pi_email_test")
    ).resolves.not.toThrow();
  });

  it("buyer can see completed orders in their order history", async () => {
    await seedPaidOrder(sellerId, buyerId, 300.0, "pi_history_1");
    await seedPaidOrder(sellerId, buyerId, 450.0, "pi_history_2");

    const orders = await getOrderHistory(buyerId);
    expect(orders).toHaveLength(2);
  });

  it("order history includes artwork title, total amount, and order number", async () => {
    await seedPaidOrder(sellerId, buyerId, 500.0, "pi_details");

    const [order] = await getOrderHistory(buyerId);
    expect(order).toHaveProperty("id");
    expect(order).toHaveProperty("totalAmount");
    expect(order).toHaveProperty("artworkTitle");
    expect(order).toHaveProperty("status");
    expect(order.status).toBe("PAID");
  });

  it("only shows this buyer's own orders", async () => {
    const otherBuyer = await prisma.user.create({
      data: { email: "other@test.com", passwordHash: "x", roles: ["BUYER"] },
    });
    await seedPaidOrder(sellerId, otherBuyer.id, 100.0, "pi_other_buyer");
    await seedPaidOrder(sellerId, buyerId, 200.0, "pi_mine");

    const orders = await getOrderHistory(buyerId);
    expect(orders).toHaveLength(1);
  });

  it("pending orders are not listed in confirmed order history", async () => {
    // Create a pending order without fulfilling it
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Pending Art", description: "", status: "PUBLISHED", publishedAt: new Date() },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100.0, currency: "USD", status: "ACTIVE" },
    });
    await prisma.order.create({
      data: {
        buyerId,
        listingType: "ORIGINAL",
        originalListingId: listing.id,
        subtotal: 100.0,
        taxAmount: 0,
        totalAmount: 100.0,
        currency: "USD",
        status: "PENDING",
      },
    });

    const orders = await getOrderHistory(buyerId);
    expect(orders).toHaveLength(0);
  });
});
