import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { getTransactionHistory, exportTransactionsCSV } from "@/lib/payments/transactions";
import { fulfillPayment } from "@/lib/payments/webhook";

async function seedCompletedSale(sellerId: string, buyerId: string, price: number, piId: string) {
  const artwork = await prisma.artwork.create({
    data: { sellerId, title: `Art ${piId}`, description: "", status: "PUBLISHED", publishedAt: new Date() },
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
  return { artwork, listing, order };
}

describe("US-4.4 — Transaction Records", () => {
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

  it("returns transaction history for a seller", async () => {
    await seedCompletedSale(sellerId, buyerId, 200.0, "pi_tx_1");
    await seedCompletedSale(sellerId, buyerId, 400.0, "pi_tx_2");

    const records = await getTransactionHistory(sellerId);
    expect(records).toHaveLength(2);
  });

  it("each record includes sale price, fees, net payout, and date", async () => {
    await seedCompletedSale(sellerId, buyerId, 500.0, "pi_tx_fields");

    const [record] = await getTransactionHistory(sellerId);
    expect(record).toHaveProperty("grossAmount");
    expect(record).toHaveProperty("platformFee");
    expect(record).toHaveProperty("processingFee");
    expect(record).toHaveProperty("netPayout");
    expect(record).toHaveProperty("createdAt");
    expect(record).toHaveProperty("artworkTitle");
    expect(record).toHaveProperty("listingId");
  });

  it("returns empty array when seller has no transactions", async () => {
    const records = await getTransactionHistory(sellerId);
    expect(records).toEqual([]);
  });

  it("does not include other sellers' transactions", async () => {
    const otherSeller = await prisma.user.create({
      data: { email: "other@test.com", passwordHash: "x", roles: ["SELLER"] },
    });
    await seedCompletedSale(otherSeller.id, buyerId, 150.0, "pi_other");
    await seedCompletedSale(sellerId, buyerId, 300.0, "pi_mine");

    const records = await getTransactionHistory(sellerId);
    expect(records).toHaveLength(1);
  });

  it("exports transactions as CSV with required columns", async () => {
    await seedCompletedSale(sellerId, buyerId, 600.0, "pi_csv");

    const csv = await exportTransactionsCSV(sellerId);
    expect(csv).toContain("grossAmount");
    expect(csv).toContain("platformFee");
    expect(csv).toContain("processingFee");
    expect(csv).toContain("netPayout");
    expect(csv).toContain("artworkTitle");
  });
});
