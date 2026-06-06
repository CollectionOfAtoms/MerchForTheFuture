import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("@/lib/payments/email", () => ({
  sendPaymentReminderEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderCancelledEmail: vi.fn().mockResolvedValue(undefined),
  sendRunnerUpEmail: vi.fn().mockResolvedValue(undefined),
  sendAuctionWonEmail: vi.fn().mockResolvedValue(undefined),
  sendAuctionLostEmail: vi.fn().mockResolvedValue(undefined),
  sendShippingNotificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPurchaseConfirmation: vi.fn().mockResolvedValue(undefined),
  sendOutbidEmail: vi.fn().mockResolvedValue(undefined),
}));

const { sendRunnerUpEmail, sendOrderCancelledEmail } = await import("@/lib/payments/email");
const { GET } = await import("@/app/api/cron/payment-deadlines/route");

function makeRequest() {
  return new Request("https://localhost/api/cron/payment-deadlines", {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? "test-secret"}` },
  });
}

describe("US-14.7 — Runner-Up Offer on Payment Expiry", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => { resetDatabase(); vi.restoreAllMocks(); });

  async function seedExpiredOrderWithRunnerUp() {
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const winner = await prisma.user.create({
      data: { email: "winner@test.com", name: "Winner", passwordHash: "x", roles: ["BUYER"] },
    });
    const runnerUp = await prisma.user.create({
      data: { email: "runner@test.com", name: "Runner", passwordHash: "x", roles: ["BUYER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "D", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD", status: "ACTIVE" },
    });
    const auction = await prisma.auction.create({
      data: {
        originalListingId: listing.id,
        startBid: 100,
        currentBid: 500,
        currentBidderId: winner.id,
        bidCount: 2,
        endAt: new Date(Date.now() - 60000),
        status: "CLOSED",
      },
    });
    await prisma.bid.create({ data: { auctionId: auction.id, bidderId: winner.id, amount: 500 } });
    await prisma.bid.create({ data: { auctionId: auction.id, bidderId: runnerUp.id, amount: 350 } });

    const order = await prisma.order.create({
      data: {
        buyerId: winner.id,
        listingType: "ORIGINAL",
        originalListingId: listing.id,
        subtotal: 500,
        totalAmount: 500,
        status: "PENDING",
        paymentDeadline: new Date(Date.now() - 1000),
      },
    });

    return { winner, runnerUp, auction, listing, order };
  }

  async function seedExpiredOrderNoBidders() {
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const winner = await prisma.user.create({
      data: { email: "winner@test.com", name: "Winner", passwordHash: "x", roles: ["BUYER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "D", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD", status: "ACTIVE" },
    });
    const auction = await prisma.auction.create({
      data: {
        originalListingId: listing.id,
        startBid: 100,
        currentBid: 500,
        currentBidderId: winner.id,
        bidCount: 1,
        endAt: new Date(Date.now() - 60000),
        status: "CLOSED",
      },
    });
    await prisma.bid.create({ data: { auctionId: auction.id, bidderId: winner.id, amount: 500 } });

    const order = await prisma.order.create({
      data: {
        buyerId: winner.id,
        listingType: "ORIGINAL",
        originalListingId: listing.id,
        subtotal: 500,
        totalAmount: 500,
        status: "PENDING",
        paymentDeadline: new Date(Date.now() - 1000),
      },
    });

    return { winner, listing, order };
  }

  it("creates a new PENDING order for the runner-up at their bid amount", async () => {
    const { runnerUp } = await seedExpiredOrderWithRunnerUp();
    await GET(makeRequest());
    const newOrder = await prisma.order.findFirst({ where: { buyerId: runnerUp.id, status: "PENDING" } });
    expect(newOrder).not.toBeNull();
    expect(Number(newOrder!.totalAmount)).toBe(350);
  });

  it("sets a fresh payment deadline on the runner-up order", async () => {
    const { runnerUp } = await seedExpiredOrderWithRunnerUp();
    await GET(makeRequest());
    const newOrder = await prisma.order.findFirst({ where: { buyerId: runnerUp.id, status: "PENDING" } });
    expect(newOrder!.paymentDeadline).not.toBeNull();
    expect(newOrder!.paymentDeadline!.getTime()).toBeGreaterThan(Date.now());
  });

  it("sends the runner-up a notification", async () => {
    const { runnerUp } = await seedExpiredOrderWithRunnerUp();
    await GET(makeRequest());
    const notification = await prisma.notification.findFirst({
      where: { userId: runnerUp.id, type: "AUCTION_WON" },
    });
    expect(notification).not.toBeNull();
  });

  it("sends the runner-up an email", async () => {
    await seedExpiredOrderWithRunnerUp();
    await GET(makeRequest());
    expect(sendRunnerUpEmail).toHaveBeenCalled();
  });

  it("sends the original winner a cancellation email", async () => {
    await seedExpiredOrderWithRunnerUp();
    await GET(makeRequest());
    expect(sendOrderCancelledEmail).toHaveBeenCalled();
  });

  it("archives the listing when no runner-up exists", async () => {
    const { listing } = await seedExpiredOrderNoBidders();
    await GET(makeRequest());
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("ARCHIVED");
  });

  it("does not create a runner-up order when no other bidders exist", async () => {
    const { winner } = await seedExpiredOrderNoBidders();
    await GET(makeRequest());
    const orders = await prisma.order.findMany({ where: { buyerId: winner.id } });
    expect(orders.every((o) => o.status === "CANCELLED")).toBe(true);
  });
});
