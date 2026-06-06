import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { initiateFixedPricePurchase } from "@/lib/artworks/fixed-price";

describe("US-2.3 — Buy Now", () => {
  let sellerId: string;
  let buyerId: string;
  let listingId: string;
  const PRICE = 500;

  beforeEach(async () => {
    await resetDatabase();

    const seller = await prisma.user.create({
      data: { email: "seller23@test.com", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;

    const buyer = await prisma.user.create({
      data: { email: "buyer23@test.com", passwordHash: "hash", roles: ["BUYER"] },
    });
    buyerId = buyer.id;

    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Buy Me", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: PRICE, currency: "USD" },
    });
    listingId = listing.id;
  });

  it("creates a pending order for a valid purchase", async () => {
    const order = await initiateFixedPricePurchase({ listingId, buyerId });

    expect(order.id).toBeDefined();
    expect(order.status).toBe("PENDING");
    expect(order.listingType).toBe("ORIGINAL");
    expect(order.originalListingId).toBe(listingId);
    expect(order.buyerId).toBe(buyerId);
  });

  it("sets the order subtotal and total to the listing price", async () => {
    const order = await initiateFixedPricePurchase({ listingId, buyerId });

    expect(Number(order.subtotal)).toBe(PRICE);
    expect(Number(order.totalAmount)).toBe(PRICE);
  });

  it("sets tax amount to zero (tax is calculated in Epic 5)", async () => {
    const order = await initiateFixedPricePurchase({ listingId, buyerId });
    expect(Number(order.taxAmount)).toBe(0);
  });

  it("carries the listing currency onto the order", async () => {
    const order = await initiateFixedPricePurchase({ listingId, buyerId });
    expect(order.currency).toBe("USD");
  });

  it("throws if the listing does not exist", async () => {
    await expect(
      initiateFixedPricePurchase({ listingId: "nonexistent", buyerId })
    ).rejects.toThrow();
  });

  it("throws if the listing is already SOLD", async () => {
    await prisma.originalListing.update({
      where: { id: listingId },
      data: { status: "SOLD" },
    });
    await expect(
      initiateFixedPricePurchase({ listingId, buyerId })
    ).rejects.toThrow(/sold|unavailable|not available/i);
  });

  it("throws if the listing is CANCELLED", async () => {
    await prisma.originalListing.update({
      where: { id: listingId },
      data: { status: "CANCELLED" },
    });
    await expect(
      initiateFixedPricePurchase({ listingId, buyerId })
    ).rejects.toThrow();
  });

  it("throws if the listing is an AUCTION (not a fixed-price listing)", async () => {
    const artwork2 = await prisma.artwork.create({
      data: { sellerId, title: "Auction Work", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    const auctionListing = await prisma.originalListing.create({
      data: { artworkId: artwork2.id, saleType: "AUCTION", currency: "USD" },
    });
    await expect(
      initiateFixedPricePurchase({ listingId: auctionListing.id, buyerId })
    ).rejects.toThrow(/auction|fixed/i);
  });

  it("throws if buyerId is missing", async () => {
    await expect(
      initiateFixedPricePurchase({ listingId, buyerId: "" })
    ).rejects.toThrow();
  });

  it("does not allow a seller to buy their own listing", async () => {
    await expect(
      initiateFixedPricePurchase({ listingId, buyerId: sellerId })
    ).rejects.toThrow(/own/i);
  });
});
