import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { closeAuction } from "@/lib/auctions/close";

describe("US-3.6 — Reserve Price Protection", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedAuctionWithReserve(highBid: number, reserve: number) {
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", name: "Buyer", passwordHash: "x" },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", price: 0, currency: "USD", status: "ACTIVE" },
    });
    const auction = await prisma.auction.create({
      data: {
        originalListingId: listing.id,
        startBid: 100,
        reservePrice: reserve,
        currentBid: highBid,
        currentBidderId: buyer.id,
        bidCount: 1,
        endAt: new Date(Date.now() - 1000),
        status: "ACTIVE",
      },
    });
    await prisma.bid.create({
      data: { auctionId: auction.id, bidderId: buyer.id, amount: highBid },
    });
    return { seller, buyer, auction, listing };
  }

  it("marks auction RESERVE_NOT_MET when high bid is below reserve", async () => {
    const { auction, listing } = await seedAuctionWithReserve(400, 1000);
    await closeAuction(auction.id);
    const updated = await prisma.auction.findUnique({ where: { id: auction.id } });
    expect(updated!.status).toBe("CLOSED");
    const updatedListing = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updatedListing!.status).not.toBe("SOLD");
  });

  it("notifies seller that reserve was not met", async () => {
    const { seller, auction } = await seedAuctionWithReserve(400, 1000);
    await closeAuction(auction.id);
    const notification = await prisma.notification.findFirst({
      where: { userId: seller.id, type: "RESERVE_NOT_MET" },
    });
    expect(notification).not.toBeNull();
  });

  it("notifies highest bidder that reserve was not met", async () => {
    const { buyer, auction } = await seedAuctionWithReserve(400, 1000);
    await closeAuction(auction.id);
    const notification = await prisma.notification.findFirst({
      where: { userId: buyer.id, type: "RESERVE_NOT_MET" },
    });
    expect(notification).not.toBeNull();
  });

  it("creates a PENDING order (not yet SOLD) when high bid meets or exceeds reserve", async () => {
    const { buyer, auction } = await seedAuctionWithReserve(1200, 1000);
    await closeAuction(auction.id);
    const order = await prisma.order.findFirst({ where: { buyerId: buyer.id, listingType: "ORIGINAL" } });
    expect(order).not.toBeNull();
    expect(order!.status).toBe("PENDING");
    // Listing stays ACTIVE until payment is collected via webhook
    const full = await prisma.auction.findUnique({
      where: { id: auction.id },
      include: { originalListing: true },
    });
    expect(full!.originalListing.status).toBe("ACTIVE");
  });

  it("does not notify RESERVE_NOT_MET when reserve is met", async () => {
    const { seller, buyer, auction } = await seedAuctionWithReserve(1200, 1000);
    await closeAuction(auction.id);
    const sellerNotif = await prisma.notification.findFirst({
      where: { userId: seller.id, type: "RESERVE_NOT_MET" },
    });
    const buyerNotif = await prisma.notification.findFirst({
      where: { userId: buyer.id, type: "RESERVE_NOT_MET" },
    });
    expect(sellerNotif).toBeNull();
    expect(buyerNotif).toBeNull();
  });
});
