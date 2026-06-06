import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { getBuyerAllBids } from "@/lib/dashboard/buyer";

describe("US-12.2 — My Bids Page", () => {
  let buyerId: string;
  let otherBuyerId: string;
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller122@test.com", name: "Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer122@test.com", name: "Buyer", passwordHash: "hash", roles: ["BUYER"] },
    });
    const other = await prisma.user.create({
      data: { email: "other122@test.com", name: "Other", passwordHash: "hash", roles: ["BUYER"] },
    });
    sellerId = seller.id;
    buyerId = buyer.id;
    otherBuyerId = other.id;
  });

  async function seedAuction(status: "ACTIVE" | "CLOSED", currentBidderId?: string) {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Art", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://cdn.example.com/a.jpg", isPrimary: true, order: 0 },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD" },
    });
    const auction = await prisma.auction.create({
      data: {
        originalListingId: listing.id,
        startBid: 50,
        currentBid: currentBidderId ? 100 : null,
        currentBidderId: currentBidderId ?? null,
        bidCount: currentBidderId ? 1 : 0,
        endAt: new Date(Date.now() + 3600000),
        status,
      },
    });
    return auction;
  }

  it("returns 'winning' for an active auction where buyer is current high bidder", async () => {
    const auction = await seedAuction("ACTIVE", buyerId);
    await prisma.bid.create({ data: { auctionId: auction.id, bidderId: buyerId, amount: 100 } });

    const bids = await getBuyerAllBids(buyerId);
    expect(bids).toHaveLength(1);
    expect(bids[0].bidStatus).toBe("winning");
  });

  it("returns 'outbid' for an active auction where another buyer is winning", async () => {
    const auction = await seedAuction("ACTIVE", otherBuyerId);
    await prisma.bid.create({ data: { auctionId: auction.id, bidderId: buyerId, amount: 80 } });

    const bids = await getBuyerAllBids(buyerId);
    expect(bids[0].bidStatus).toBe("outbid");
  });

  it("returns 'won' for a closed auction where buyer was the winner", async () => {
    const auction = await seedAuction("CLOSED", buyerId);
    await prisma.bid.create({ data: { auctionId: auction.id, bidderId: buyerId, amount: 100 } });

    const bids = await getBuyerAllBids(buyerId);
    expect(bids[0].bidStatus).toBe("won");
  });

  it("returns 'lost' for a closed auction where buyer was not the winner", async () => {
    const auction = await seedAuction("CLOSED", otherBuyerId);
    await prisma.bid.create({ data: { auctionId: auction.id, bidderId: buyerId, amount: 80 } });

    const bids = await getBuyerAllBids(buyerId);
    expect(bids[0].bidStatus).toBe("lost");
  });

  it("does not return bids placed by other buyers", async () => {
    const auction = await seedAuction("ACTIVE", otherBuyerId);
    await prisma.bid.create({ data: { auctionId: auction.id, bidderId: otherBuyerId, amount: 100 } });

    const bids = await getBuyerAllBids(buyerId);
    expect(bids).toHaveLength(0);
  });

  it("returns all statuses when buyer has bids across multiple auctions", async () => {
    const a1 = await seedAuction("ACTIVE", buyerId);
    await prisma.bid.create({ data: { auctionId: a1.id, bidderId: buyerId, amount: 100 } });

    const a2 = await seedAuction("ACTIVE", otherBuyerId);
    await prisma.bid.create({ data: { auctionId: a2.id, bidderId: buyerId, amount: 80 } });

    const a3 = await seedAuction("CLOSED", buyerId);
    await prisma.bid.create({ data: { auctionId: a3.id, bidderId: buyerId, amount: 100 } });

    const a4 = await seedAuction("CLOSED", otherBuyerId);
    await prisma.bid.create({ data: { auctionId: a4.id, bidderId: buyerId, amount: 60 } });

    const bids = await getBuyerAllBids(buyerId);
    const statuses = bids.map((b) => b.bidStatus).sort();
    expect(statuses).toEqual(["lost", "outbid", "winning", "won"]);
  });
});
