import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { placeBid } from "@/lib/auctions/bid";

describe("US-3.4 — Outbid Notification", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedAuction() {
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
    const auction = await prisma.auction.create({
      data: {
        originalListingId: listing.id,
        startBid: 100,
        endAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        status: "ACTIVE",
      },
    });
    return { seller, buyer1, buyer2, auction };
  }

  it("creates OUTBID notification for previous high bidder when outbid", async () => {
    const { auction, buyer1, buyer2 } = await seedAuction();
    await placeBid({ auctionId: auction.id, bidderId: buyer1.id, amount: 150 });
    await placeBid({ auctionId: auction.id, bidderId: buyer2.id, amount: 200 });

    const notifications = await prisma.notification.findMany({
      where: { userId: buyer1.id, type: "OUTBID" },
    });
    expect(notifications.length).toBe(1);
    expect(notifications[0].type).toBe("OUTBID");
  });

  it("notification payload includes auction link info", async () => {
    const { auction, buyer1, buyer2 } = await seedAuction();
    await placeBid({ auctionId: auction.id, bidderId: buyer1.id, amount: 150 });
    await placeBid({ auctionId: auction.id, bidderId: buyer2.id, amount: 200 });

    const notification = await prisma.notification.findFirst({
      where: { userId: buyer1.id, type: "OUTBID" },
    });
    expect(notification).not.toBeNull();
    const payload = notification!.payload as Record<string, unknown>;
    expect(payload.auctionId).toBe(auction.id);
    expect(typeof payload.newHighBid).toBe("number");
  });

  it("does not create OUTBID notification for the new high bidder", async () => {
    const { auction, buyer1, buyer2 } = await seedAuction();
    await placeBid({ auctionId: auction.id, bidderId: buyer1.id, amount: 150 });
    await placeBid({ auctionId: auction.id, bidderId: buyer2.id, amount: 200 });

    const notifications = await prisma.notification.findMany({
      where: { userId: buyer2.id, type: "OUTBID" },
    });
    expect(notifications.length).toBe(0);
  });

  it("does not send OUTBID notification on first bid", async () => {
    const { auction, buyer1 } = await seedAuction();
    await placeBid({ auctionId: auction.id, bidderId: buyer1.id, amount: 150 });

    const notifications = await prisma.notification.findMany({
      where: { type: "OUTBID" },
    });
    expect(notifications.length).toBe(0);
  });
});
