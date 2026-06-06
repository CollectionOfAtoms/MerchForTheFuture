import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("@/lib/payments/email", () => ({
  sendAuctionWonEmail: vi.fn().mockResolvedValue(undefined),
  sendAuctionLostEmail: vi.fn().mockResolvedValue(undefined),
  sendShippingNotificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentReminderEmail: vi.fn().mockResolvedValue(undefined),
  sendPurchaseConfirmation: vi.fn().mockResolvedValue(undefined),
  sendOutbidEmail: vi.fn().mockResolvedValue(undefined),
}));

const { closeAuction, closeExpiredAuctions } = await import("@/lib/auctions/close");

describe("US-14.3 — Auction Close Creates Order for Winner", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => { resetDatabase(); vi.restoreAllMocks(); });

  async function seedAuction(opts: { withBid?: boolean; reserve?: number; endInFuture?: boolean } = {}) {
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", name: "Buyer", passwordHash: "x", roles: ["BUYER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD", status: "ACTIVE" },
    });
    const auction = await prisma.auction.create({
      data: {
        originalListingId: listing.id,
        startBid: 100,
        reservePrice: opts.reserve ?? null,
        currentBid: opts.withBid !== false ? 500 : null,
        currentBidderId: opts.withBid !== false ? buyer.id : null,
        bidCount: opts.withBid !== false ? 1 : 0,
        endAt: opts.endInFuture ? new Date(Date.now() + 3600000) : new Date(Date.now() - 1000),
        status: "ACTIVE",
      },
    });
    if (opts.withBid !== false) {
      await prisma.bid.create({ data: { auctionId: auction.id, bidderId: buyer.id, amount: 500 } });
    }
    return { seller, buyer, listing, auction };
  }

  it("creates a PENDING order for the winner", async () => {
    const { buyer, auction } = await seedAuction();
    await closeAuction(auction.id);
    const order = await prisma.order.findFirst({ where: { buyerId: buyer.id } });
    expect(order).not.toBeNull();
    expect(order!.status).toBe("PENDING");
    expect(Number(order!.totalAmount)).toBe(500);
    expect(order!.listingType).toBe("ORIGINAL");
  });

  it("sets paymentDeadline on the created order", async () => {
    const { buyer, auction } = await seedAuction();
    await closeAuction(auction.id);
    const order = await prisma.order.findFirst({ where: { buyerId: buyer.id } });
    expect(order!.paymentDeadline).not.toBeNull();
    expect(order!.paymentDeadline!.getTime()).toBeGreaterThan(Date.now());
  });

  it("does NOT create an order when reserve is not met", async () => {
    const { buyer, auction } = await seedAuction({ reserve: 1000 });
    await closeAuction(auction.id);
    const order = await prisma.order.findFirst({ where: { buyerId: buyer.id } });
    expect(order).toBeNull();
  });

  it("marks listing as RESERVE_NOT_MET when reserve not met", async () => {
    const { listing, auction } = await seedAuction({ reserve: 1000 });
    await closeAuction(auction.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("RESERVE_NOT_MET");
  });

  it("marks listing as ARCHIVED when no bids", async () => {
    const { listing, auction } = await seedAuction({ withBid: false });
    await closeAuction(auction.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("ARCHIVED");
  });

  it("closeExpiredAuctions closes all expired auctions", async () => {
    const { auction } = await seedAuction();
    const result = await closeExpiredAuctions();
    expect(result.closed).toBeGreaterThanOrEqual(1);
    expect(result.skipped).toBe(0);
    const updated = await prisma.auction.findUnique({ where: { id: auction.id } });
    expect(updated!.status).toBe("CLOSED");
  });
});
