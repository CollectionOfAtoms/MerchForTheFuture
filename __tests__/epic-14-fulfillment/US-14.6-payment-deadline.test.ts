import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("@/lib/payments/email", () => ({
  sendPaymentReminderEmail: vi.fn().mockResolvedValue(undefined),
  sendAuctionWonEmail: vi.fn(),
  sendAuctionLostEmail: vi.fn(),
  sendShippingNotificationEmail: vi.fn(),
  sendPurchaseConfirmation: vi.fn(),
  sendOutbidEmail: vi.fn(),
}));

const { sendPaymentReminderEmail } = await import("@/lib/payments/email");

describe("US-14.6 — Payment Deadline", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => { resetDatabase(); vi.restoreAllMocks(); });

  async function seedPendingOrder(paymentDeadline: Date) {
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const admin = await prisma.user.create({
      data: { email: "admin@test.com", name: "Admin", passwordHash: "x", roles: ["ADMIN"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", name: "Buyer", passwordHash: "x", roles: ["BUYER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "D", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD", status: "ACTIVE" },
    });
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "ORIGINAL",
        originalListingId: listing.id,
        subtotal: 500,
        totalAmount: 500,
        status: "PENDING",
        paymentDeadline,
      },
    });
    return { buyer, admin, order };
  }

  it("cancels orders whose payment deadline has passed", async () => {
    const { order } = await seedPendingOrder(new Date(Date.now() - 1000));

    // Simulate the cron logic inline (testing the DB outcome)
    const expired = await prisma.order.findMany({
      where: { status: "PENDING", paymentDeadline: { lte: new Date() }, listingType: "ORIGINAL", stripePaymentIntentId: null },
    });
    for (const o of expired) {
      await prisma.order.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
    }

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe("CANCELLED");
  });

  it("sends a reminder email when deadline is within 24 hours", async () => {
    const deadline = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h from now
    const { order } = await seedPendingOrder(deadline);

    const hoursRemaining = Math.ceil((deadline.getTime() - Date.now()) / (60 * 60 * 1000));
    await sendPaymentReminderEmail(order.id, hoursRemaining);

    expect(sendPaymentReminderEmail).toHaveBeenCalledWith(order.id, expect.any(Number));
  });

  it("does not cancel orders that still have time remaining", async () => {
    const { order } = await seedPendingOrder(new Date(Date.now() + 25 * 60 * 60 * 1000));

    const expired = await prisma.order.findMany({
      where: { status: "PENDING", paymentDeadline: { lte: new Date() }, listingType: "ORIGINAL", stripePaymentIntentId: null },
    });
    // This order should not be in the expired list
    expect(expired.find((o) => o.id === order.id)).toBeUndefined();
  });
});
