import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { server } from "../mocks/server";
import { http, HttpResponse } from "msw";

// ─── Auth mock ────────────────────────────────────────────────────────────────

let mockSession: { user: { id: string } } | null = null;

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => mockSession),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedOrderWithSeller() {
  const seller = await prisma.user.create({
    data: { email: "seller@test.com", passwordHash: "x", roles: ["SELLER"], name: "Pat Seller" },
  });
  const buyer = await prisma.user.create({
    data: { email: "buyer@test.com", passwordHash: "x", roles: ["BUYER"], name: "Jordan Buyer" },
  });
  const otherBuyer = await prisma.user.create({
    data: { email: "other@test.com", passwordHash: "x", roles: ["BUYER"] },
  });

  const artwork = await prisma.artwork.create({
    data: {
      sellerId: seller.id,
      title: "Ocean Wind",
      description: "",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  await prisma.artworkImage.create({
    data: {
      artworkId: artwork.id,
      url: "https://cdn.test/ocean.jpg",
      thumbnailUrl: "https://cdn.test/ocean-thumb.jpg",
      isPrimary: true,
    },
  });

  const listing = await prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: "FIXED_PRICE",
      price: 600.0,
      currency: "USD",
      status: "SOLD",
    },
  });

  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      listingType: "ORIGINAL",
      originalListingId: listing.id,
      subtotal: 600.0,
      taxAmount: 0,
      totalAmount: 600.0,
      currency: "USD",
      status: "PAID",
    },
  });

  return { seller, buyer, otherBuyer, artwork, listing, order };
}

// ─── US-22.4: contactSupportAction ───────────────────────────────────────────

describe("US-22.4 — contactSupportAction", () => {
  beforeEach(async () => {
    await resetDatabase();
    mockSession = null;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("returns success and calls Resend when valid message provided", async () => {
    const { contactSupportAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrderWithSeller();
    mockSession = { user: { id: buyer.id } };

    let emailCalled = false;
    server.use(
      http.post("https://api.resend.com/emails", () => {
        emailCalled = true;
        return HttpResponse.json({ id: "email_test_mock" });
      })
    );

    const result = await contactSupportAction(order.id, "I have a question about my order.");

    expect(result).toEqual({ success: true });
    expect(emailCalled).toBe(true);
  });

  it("sends the email to the seller's email address", async () => {
    const { contactSupportAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrderWithSeller();
    mockSession = { user: { id: buyer.id } };

    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "email_test_mock" });
      })
    );

    await contactSupportAction(order.id, "Where is my order?");

    expect(capturedBody?.to).toBe("seller@test.com");
  });

  it("sends an email subject containing the order ID (last 8 chars uppercased)", async () => {
    const { contactSupportAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrderWithSeller();
    mockSession = { user: { id: buyer.id } };

    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "email_test_mock" });
      })
    );

    await contactSupportAction(order.id, "Test message");

    const expectedRef = order.id.slice(-8).toUpperCase();
    expect(capturedBody?.subject).toContain(`Order #${expectedRef}`);
  });

  it("includes the buyer's message verbatim in the email body", async () => {
    const { contactSupportAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrderWithSeller();
    mockSession = { user: { id: buyer.id } };

    const message = "My artwork arrived damaged — the corner is bent.";
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "email_test_mock" });
      })
    );

    await contactSupportAction(order.id, message);

    expect(capturedBody?.html as string).toContain(message);
  });

  it("returns error when message is empty string", async () => {
    const { contactSupportAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrderWithSeller();
    mockSession = { user: { id: buyer.id } };

    const result = await contactSupportAction(order.id, "");

    expect(result).toEqual({ error: "Message is required." });
  });

  it("returns error when message is only whitespace", async () => {
    const { contactSupportAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrderWithSeller();
    mockSession = { user: { id: buyer.id } };

    const result = await contactSupportAction(order.id, "   \n  ");

    expect(result).toEqual({ error: "Message is required." });
  });

  it("returns Unauthorized when there is no session", async () => {
    const { contactSupportAction } = await import("@/app/actions/order");
    const { order } = await seedOrderWithSeller();
    mockSession = null;

    const result = await contactSupportAction(order.id, "Help please");

    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns Unauthorized when a different buyer tries to contact support", async () => {
    const { contactSupportAction } = await import("@/app/actions/order");
    const { otherBuyer, order } = await seedOrderWithSeller();
    mockSession = { user: { id: otherBuyer.id } };

    const result = await contactSupportAction(order.id, "This is not my order");

    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns an error (does not throw) when Resend returns a non-2xx status", async () => {
    const { contactSupportAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrderWithSeller();
    mockSession = { user: { id: buyer.id } };

    server.use(
      http.post("https://api.resend.com/emails", () =>
        HttpResponse.json({ message: "Internal error" }, { status: 500 })
      )
    );

    const result = await contactSupportAction(order.id, "A valid message");

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toBeTruthy();
  });

  it("returns Unauthorized for a non-existent order", async () => {
    const { contactSupportAction } = await import("@/app/actions/order");
    const buyer = await prisma.user.create({
      data: { email: "buyer2@test.com", passwordHash: "x", roles: ["BUYER"] },
    });
    mockSession = { user: { id: buyer.id } };

    const result = await contactSupportAction("nonexistent-order-id", "Hello");

    expect(result).toEqual({ error: "Unauthorized" });
  });
});
