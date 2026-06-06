import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { placeBid } from "@/lib/auctions/bid";

describe("US-3.2 — Place Bid", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedAuction(
    startBid = 100,
    endAt?: Date,
    status: "SCHEDULED" | "ACTIVE" | "CLOSED" = "ACTIVE"
  ) {
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
        startBid,
        endAt: endAt ?? new Date(Date.now() + 48 * 60 * 60 * 1000),
        status,
      },
    });
    return { seller, buyer, artwork, listing, auction };
  }

  it("places a valid bid above the start bid", async () => {
    const { auction, buyer } = await seedAuction(100);
    const bid = await placeBid({ auctionId: auction.id, bidderId: buyer.id, amount: 150 });
    expect(bid.auctionId).toBe(auction.id);
    expect(bid.bidderId).toBe(buyer.id);
    expect(Number(bid.amount)).toBe(150);
    expect(bid.placedAt).toBeInstanceOf(Date);
  });

  it("updates auction currentBid and bidCount after bid", async () => {
    const { auction, buyer } = await seedAuction(100);
    await placeBid({ auctionId: auction.id, bidderId: buyer.id, amount: 150 });
    const updated = await prisma.auction.findUnique({ where: { id: auction.id } });
    expect(Number(updated!.currentBid)).toBe(150);
    expect(updated!.bidCount).toBe(1);
    expect(updated!.currentBidderId).toBe(buyer.id);
  });

  it("rejects bid at or below the current highest bid", async () => {
    const { auction, buyer } = await seedAuction(100);
    await placeBid({ auctionId: auction.id, bidderId: buyer.id, amount: 150 });
    const buyer2 = await prisma.user.create({
      data: { email: "buyer2@test.com", name: "Buyer 2", passwordHash: "x" },
    });
    await expect(
      placeBid({ auctionId: auction.id, bidderId: buyer2.id, amount: 150 })
    ).rejects.toThrow(/must exceed|higher/i);
  });

  it("rejects bid below the start bid", async () => {
    const { auction, buyer } = await seedAuction(100);
    await expect(
      placeBid({ auctionId: auction.id, bidderId: buyer.id, amount: 50 })
    ).rejects.toThrow(/start bid|minimum/i);
  });

  it("rejects bid on a closed auction", async () => {
    const { auction, buyer } = await seedAuction(100, undefined, "CLOSED");
    await expect(
      placeBid({ auctionId: auction.id, bidderId: buyer.id, amount: 200 })
    ).rejects.toThrow(/closed|ended|not active/i);
  });

  it("stores bid timestamp", async () => {
    const before = new Date();
    const { auction, buyer } = await seedAuction(100);
    const bid = await placeBid({ auctionId: auction.id, bidderId: buyer.id, amount: 150 });
    const after = new Date();
    expect(bid.placedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(bid.placedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
