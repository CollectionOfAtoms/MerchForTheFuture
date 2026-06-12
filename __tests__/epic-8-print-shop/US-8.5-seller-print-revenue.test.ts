import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { getPrintRevenueSummary } from "@/lib/print/revenue";

describe("US-8.5 — Seller Print Revenue", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedPrintSale(sellerEmail: string, buyerEmail: string, price: number) {
    const seller = await prisma.user.findFirst({ where: { email: sellerEmail } }) ??
      await prisma.user.create({ data: { email: sellerEmail, name: "Seller", passwordHash: "x", roles: ["SELLER"] } });
    const buyer = await prisma.user.findFirst({ where: { email: buyerEmail } }) ??
      await prisma.user.create({ data: { email: buyerEmail, name: "Buyer", passwordHash: "x" } });
    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
    });
    const originalListing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: 500,
        currency: "USD",
        availableForPrint: true,
        printSourceImageUrl: "https://cdn.example.com/art.jpg",
        printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price }],
      },
    });
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "PRINT",
        originalListingId: originalListing.id,
        externalSku: "GLOBAL-FAP-16X24",
        externalOrderId: `ord-${Math.random().toString(36).slice(2)}`,
        subtotal: price,
        taxAmount: 0,
        totalAmount: price,
        currency: "USD",
        status: "PAID",
      },
    });
    await prisma.transaction.create({
      data: {
        orderId: order.id,
        grossAmount: price,
        platformFee: price * 0.10,
        processingFee: price * 0.03,
        fulfillmentCost: price * 0.40,
        netPayout: price * 0.47,
      },
    });
    return { seller, buyer, artwork, originalListing, order };
  }

  it("returns print revenue summary for seller", async () => {
    const { seller } = await seedPrintSale("seller@test.com", "buyer@test.com", 75);
    const summary = await getPrintRevenueSummary(seller.id);
    expect(summary.totalPrintSales).toBe(1);
    expect(Number(summary.totalRevenue)).toBeCloseTo(75, 2);
  });

  it("shows platform fee, fulfillment cost, and net payout per sale", async () => {
    const { seller } = await seedPrintSale("seller@test.com", "buyer@test.com", 100);
    const summary = await getPrintRevenueSummary(seller.id);
    expect(Number(summary.totalPlatformFees)).toBeCloseTo(10, 2);
    expect(Number(summary.totalFulfillmentCosts)).toBeCloseTo(40, 2);
    expect(Number(summary.totalNetPayout)).toBeCloseTo(47, 2);
  });

  it("returns zero for seller with no print sales", async () => {
    const seller = await prisma.user.create({
      data: { email: "noprint@test.com", name: "No Sales", passwordHash: "x", roles: ["SELLER"] },
    });
    const summary = await getPrintRevenueSummary(seller.id);
    expect(summary.totalPrintSales).toBe(0);
    expect(Number(summary.totalRevenue)).toBe(0);
  });

  it("groups units sold per artwork", async () => {
    const { seller, artwork } = await seedPrintSale("seller@test.com", "buyer1@test.com", 75);
    const summary = await getPrintRevenueSummary(seller.id);
    const artworkStats = summary.byArtwork.find((a) => a.artworkId === artwork.id);
    expect(artworkStats).toBeDefined();
    expect(artworkStats!.unitsSold).toBe(1);
  });
});
