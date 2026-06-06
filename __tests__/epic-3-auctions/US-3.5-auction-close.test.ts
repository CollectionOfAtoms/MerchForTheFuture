import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { closeAuction } from "@/lib/auctions/close";

describe("US-3.5 — Auction Close", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedActiveAuction(withBid = true) {
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
        currentBid: withBid ? 500 : null,
        currentBidderId: withBid ? buyer.id : null,
        bidCount: withBid ? 1 : 0,
        endAt: new Date(Date.now() - 1000),
        status: "ACTIVE",
      },
    });
    if (withBid) {
      await prisma.bid.create({
        data: { auctionId: auction.id, bidderId: buyer.id, amount: 500 },
      });
    }
    return { seller, buyer, artwork, listing, auction };
  }

  it("marks auction as CLOSED when it ends with a winning bid", async () => {
    const { auction } = await seedActiveAuction(true);
    await closeAuction(auction.id);
    const updated = await prisma.auction.findUnique({ where: { id: auction.id } });
    expect(updated!.status).toBe("CLOSED");
  });

  it("creates a PENDING order for the winner when auction closes with a winning bid", async () => {
    const { buyer, auction } = await seedActiveAuction(true);
    await closeAuction(auction.id);
    const order = await prisma.order.findFirst({ where: { buyerId: buyer.id, listingType: "ORIGINAL" } });
    expect(order).not.toBeNull();
    expect(order!.status).toBe("PENDING");
    expect(Number(order!.totalAmount)).toBe(500);
  });

  it("creates AUCTION_WON notification for winning bidder", async () => {
    const { buyer, auction } = await seedActiveAuction(true);
    await closeAuction(auction.id);
    const notification = await prisma.notification.findFirst({
      where: { userId: buyer.id, type: "AUCTION_WON" },
    });
    expect(notification).not.toBeNull();
  });

  it("creates AUCTION_CLOSED notification for seller", async () => {
    const { seller, auction } = await seedActiveAuction(true);
    await closeAuction(auction.id);
    const notification = await prisma.notification.findFirst({
      where: { userId: seller.id, type: "AUCTION_CLOSED" },
    });
    expect(notification).not.toBeNull();
  });

  it("is idempotent — closing an already-closed auction does nothing", async () => {
    const { auction } = await seedActiveAuction(true);
    await closeAuction(auction.id);
    await expect(closeAuction(auction.id)).resolves.not.toThrow();
    const updated = await prisma.auction.findUnique({ where: { id: auction.id } });
    expect(updated!.status).toBe("CLOSED");
  });
});
