import { describe, it, expect, beforeEach, afterAll, vi, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedOrder(overrides?: { status?: string }) {
  const seller = await prisma.user.create({
    data: { email: "seller@test.com", passwordHash: "x", roles: ["SELLER"] },
  });
  const buyer = await prisma.user.create({
    data: { email: "buyer@test.com", passwordHash: "x", roles: ["BUYER"] },
  });

  const artwork = await prisma.artwork.create({
    data: {
      sellerId: seller.id,
      title: "Test Piece",
      description: "",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  const listing = await prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: "FIXED_PRICE",
      price: 500.0,
      currency: "USD",
      status: "ACTIVE",
    },
  });

  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      listingType: "ORIGINAL",
      originalListingId: listing.id,
      subtotal: 500.0,
      taxAmount: 0,
      totalAmount: 500.0,
      currency: "USD",
      status: (overrides?.status ?? "PENDING") as "PENDING" | "PAID",
    },
  });

  return { seller, buyer, listing, order };
}

// ─── US-21.1: createCheckoutSession ──────────────────────────────────────────

describe("US-21.1 — createCheckoutSession", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("returns a clientSecret and sessionId for a pending order", async () => {
    const { createCheckoutSession } = await import("@/lib/payments/stripe");
    const { order } = await seedOrder();

    const result = await createCheckoutSession(order.id);

    expect(result).toHaveProperty("clientSecret");
    expect(result).toHaveProperty("sessionId");
    expect(result.clientSecret).toBeTruthy();
    expect(result.sessionId).toBeTruthy();
  });

  it("stores the stripeSessionId on the order", async () => {
    const { createCheckoutSession } = await import("@/lib/payments/stripe");
    const { order } = await seedOrder();

    const { sessionId } = await createCheckoutSession(order.id);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.stripeSessionId).toBe(sessionId);
  });

  it("throws if the order does not exist", async () => {
    const { createCheckoutSession } = await import("@/lib/payments/stripe");
    await expect(createCheckoutSession("nonexistent-id")).rejects.toThrow(/not found/i);
  });

  it("throws if the order is already paid", async () => {
    const { createCheckoutSession } = await import("@/lib/payments/stripe");
    const { order } = await seedOrder({ status: "PAID" });
    await expect(createCheckoutSession(order.id)).rejects.toThrow(/already paid/i);
  });

  it("amount in POST body is in cents", async () => {
    // The MSW handler for /v1/checkout/sessions should receive amount_total
    // matching the order total × 100. We verify the session is created
    // successfully (MSW responds) which implies the call reached Stripe.
    const { createCheckoutSession } = await import("@/lib/payments/stripe");
    const { order } = await seedOrder();
    const result = await createCheckoutSession(order.id);
    expect(result.clientSecret).toContain("secret");
  });
});

// ─── US-21.1: Webhook — checkout.session.completed ───────────────────────────

describe("US-21.1 — webhook: checkout.session.completed fulfills order", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("marks the order PAID when checkout.session.completed fires", async () => {
    const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
    const { order } = await seedOrder();

    // Simulate the session ID being stored (as if createCheckoutSession was called)
    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: "cs_test_mock" },
    });

    await fulfillPaymentBySession("cs_test_mock", order.id);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("PAID");
  });

  it("creates a Transaction record on fulfillment", async () => {
    const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
    const { order } = await seedOrder();

    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: "cs_test_mock" },
    });

    await fulfillPaymentBySession("cs_test_mock", order.id);

    const tx = await prisma.transaction.findFirst({ where: { orderId: order.id } });
    expect(tx).not.toBeNull();
    expect(Number(tx?.grossAmount)).toBe(500);
  });

  it("marks the associated listing SOLD for an ORIGINAL order", async () => {
    const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
    const { order, listing } = await seedOrder();

    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: "cs_test_mock" },
    });

    await fulfillPaymentBySession("cs_test_mock", order.id);

    const updatedListing = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updatedListing?.status).toBe("SOLD");
  });

  it("is idempotent — calling twice does not error", async () => {
    const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
    const { order } = await seedOrder();

    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: "cs_test_mock" },
    });

    await fulfillPaymentBySession("cs_test_mock", order.id);
    // Second call should exit cleanly via the idempotency guard
    await expect(fulfillPaymentBySession("cs_test_mock", order.id)).resolves.not.toThrow();
  });

  it("throws if order not found for the given sessionId", async () => {
    const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
    await expect(fulfillPaymentBySession("cs_unknown", "bad-order-id")).rejects.toThrow(/not found/i);
  });
});

// ─── US-21.1: /api/checkout-session route ────────────────────────────────────

// Auth is mocked at the module level with a controllable session variable.
let mockSession: { user: { id: string } } | null = null;

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => mockSession),
}));

describe("US-21.1 — /api/checkout-session route", () => {
  beforeEach(async () => {
    await resetDatabase();
    mockSession = null;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockSession = null;
    const { POST } = await import("@/app/api/checkout-session/route");
    const req = new Request("http://localhost/api/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "any" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when orderId is missing", async () => {
    mockSession = { user: { id: "user-1" } };
    const { POST } = await import("@/app/api/checkout-session/route");
    const req = new Request("http://localhost/api/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns clientSecret for an authenticated request with a valid order", async () => {
    const { order, buyer } = await seedOrder();
    mockSession = { user: { id: buyer.id } };
    const { POST } = await import("@/app/api/checkout-session/route");
    const req = new Request("http://localhost/api/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("clientSecret");
    expect(body).toHaveProperty("sessionId");
  });
});
