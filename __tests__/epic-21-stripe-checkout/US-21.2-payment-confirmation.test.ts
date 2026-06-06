import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedOrderWithSession(sessionId = "cs_test_mock") {
  const seller = await prisma.user.create({
    data: { email: "seller@test.com", passwordHash: "x", roles: ["SELLER"] },
  });
  const buyer = await prisma.user.create({
    data: { email: "buyer@test.com", passwordHash: "x", roles: ["BUYER"] },
  });

  const artwork = await prisma.artwork.create({
    data: {
      sellerId: seller.id,
      title: "Paid Piece",
      description: "",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  const listing = await prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: "FIXED_PRICE",
      price: 300.0,
      currency: "USD",
      status: "ACTIVE",
    },
  });

  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      listingType: "ORIGINAL",
      originalListingId: listing.id,
      subtotal: 300.0,
      taxAmount: 0,
      totalAmount: 300.0,
      currency: "USD",
      status: "PENDING",
      stripeSessionId: sessionId,
    },
  });

  return { seller, buyer, listing, order };
}

// ─── US-21.2: fulfillPaymentBySession (synchronous confirmation path) ─────────

describe("US-21.2 — fulfillPaymentBySession (synchronous post-redirect path)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("marks the order PAID when the Stripe session payment_status is 'paid'", async () => {
    // MSW returns payment_status: "paid" for GET /v1/checkout/sessions/cs_test_mock
    const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
    const { order } = await seedOrderWithSession("cs_test_mock");

    await fulfillPaymentBySession("cs_test_mock", order.id);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("PAID");
  });

  it("is idempotent — already-PAID order returns without re-running fulfillment", async () => {
    const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
    const { order } = await seedOrderWithSession("cs_test_mock");

    // Pre-mark as paid
    await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });

    // Should resolve cleanly without creating a duplicate Transaction
    await expect(fulfillPaymentBySession("cs_test_mock", order.id)).resolves.not.toThrow();

    const txCount = await prisma.transaction.count({ where: { orderId: order.id } });
    expect(txCount).toBe(0); // No new transaction created
  });

  it("throws when session payment_status is not 'paid'", async () => {
    // MSW will return payment_status: "unpaid" for cs_test_unpaid
    const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
    const { order } = await seedOrderWithSession("cs_test_unpaid");

    await expect(fulfillPaymentBySession("cs_test_unpaid", order.id)).rejects.toThrow(
      /payment not completed/i
    );

    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.status).toBe("PENDING");
  });

  it("throws when order is not found", async () => {
    const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
    await expect(fulfillPaymentBySession("cs_test_mock", "no-such-order")).rejects.toThrow(
      /not found/i
    );
  });
});

// ─── US-21.2: fulfillment page renders confirmation on ?session_id param ───────
// These tests cover the server-side data-fetching logic that the page would
// invoke. The page itself is a server component tested via its data layer.

describe("US-21.2 — resolveSessionFulfillment: page helper for ?session_id param", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("returns the order in PAID state after calling resolveSessionFulfillment", async () => {
    const { resolveSessionFulfillment } = await import("@/lib/payments/webhook");
    const { order } = await seedOrderWithSession("cs_test_mock");

    await resolveSessionFulfillment(order.id, "cs_test_mock");

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("PAID");
  });

  it("no-ops when session_id does not match the order's stripeSessionId", async () => {
    const { resolveSessionFulfillment } = await import("@/lib/payments/webhook");
    const { order } = await seedOrderWithSession("cs_test_mock");

    // Passing the wrong session ID — should not mutate
    await expect(
      resolveSessionFulfillment(order.id, "cs_wrong_session")
    ).resolves.not.toThrow();

    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    // Order stays PENDING because the session IDs don't match — no fulfillment ran
    expect(unchanged?.status).toBe("PENDING");
  });
});
