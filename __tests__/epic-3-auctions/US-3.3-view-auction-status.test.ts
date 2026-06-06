import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { getAuctionStatus } from "@/lib/auctions/status";

describe("US-3.3 — View Auction Status", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedAuctionWithBids() {
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const buyer1 = await prisma.user.create({
      data: { email: "buyer1@test.com", name: "Buyer 1", passwordHash: "x" },
    });
    const buyer2 = await prisma.user.create({
      data: { email: "buyer2@test.com", name: "Buyer 2", passwordHash: "x" },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", price: 0, currency: "USD", status: "ACTIVE" },
    });
    const endAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const auction = await prisma.auction.create({
      data: {
        originalListingId: listing.id,
        startBid: 100,
        currentBid: 200,
        currentBidderId: buyer2.id,
        bidCount: 2,
        endAt,
        status: "ACTIVE",
      },
    });
    await prisma.bid.createMany({
      data: [
        { auctionId: auction.id, bidderId: buyer1.id, amount: 150 },
        { auctionId: auction.id, bidderId: buyer2.id, amount: 200 },
      ],
    });
    return { seller, buyer1, buyer2, artwork, listing, auction, endAt };
  }

  it("returns current highest bid", async () => {
    const { auction } = await seedAuctionWithBids();
    const status = await getAuctionStatus(auction.id);
    expect(Number(status.currentBid)).toBe(200);
  });

  it("returns bid count", async () => {
    const { auction } = await seedAuctionWithBids();
    const status = await getAuctionStatus(auction.id);
    expect(status.bidCount).toBe(2);
  });

  it("returns time remaining as positive ms when auction is active", async () => {
    const { auction } = await seedAuctionWithBids();
    const status = await getAuctionStatus(auction.id);
    expect(status.timeRemainingMs).toBeGreaterThan(0);
  });

  it("returns bid history with amounts but no bidder identities", async () => {
    const { auction } = await seedAuctionWithBids();
    const status = await getAuctionStatus(auction.id);
    expect(Array.isArray(status.bidHistory)).toBe(true);
    expect(status.bidHistory.length).toBe(2);
    for (const entry of status.bidHistory) {
      expect(typeof entry.amount).toBe("number");
      expect(entry).not.toHaveProperty("bidderId");
      expect(entry).not.toHaveProperty("bidderEmail");
      expect(entry).not.toHaveProperty("bidderName");
    }
  });

  it("returns start bid when no bids placed", async () => {
    const seller = await prisma.user.create({
      data: { email: "seller2@test.com", name: "Seller2", passwordHash: "x", roles: ["SELLER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Art2", description: "", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", price: 0, currency: "USD", status: "ACTIVE" },
    });
    const auction = await prisma.auction.create({
      data: {
        originalListingId: listing.id,
        startBid: 250,
        endAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        status: "ACTIVE",
      },
    });
    const status = await getAuctionStatus(auction.id);
    expect(Number(status.startBid)).toBe(250);
    expect(status.currentBid).toBeNull();
    expect(status.bidCount).toBe(0);
  });

  it("throws if auction not found", async () => {
    await expect(getAuctionStatus("nonexistent-id")).rejects.toThrow(/not found/i);
  });
});
