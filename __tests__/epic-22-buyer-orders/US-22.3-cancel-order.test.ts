import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

// ─── Auth mock ────────────────────────────────────────────────────────────────

let mockSession: { user: { id: string } } | null = null;

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => mockSession),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedOrder(overrides?: { status?: string }) {
  const seller = await prisma.user.create({
    data: { email: "seller@test.com", passwordHash: "x", roles: ["SELLER"] },
  });
  const buyer = await prisma.user.create({
    data: { email: "buyer@test.com", passwordHash: "x", roles: ["BUYER"] },
  });
  const otherBuyer = await prisma.user.create({
    data: { email: "other@test.com", passwordHash: "x", roles: ["BUYER"] },
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
      status: (overrides?.status ?? "PENDING") as string,
    },
  });

  return { seller, buyer, otherBuyer, listing, order };
}

// ─── US-22.3: cancelOrderAction ───────────────────────────────────────────────

describe("US-22.3 — cancelOrderAction", () => {
  beforeEach(async () => {
    await resetDatabase();
    mockSession = null;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("cancels a PENDING order owned by the authenticated buyer", async () => {
    const { cancelOrderAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrder({ status: "PENDING" });
    mockSession = { user: { id: buyer.id } };

    const result = await cancelOrderAction(order.id);

    expect(result).toEqual({ success: true });
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("CANCELLED");
  });

  it("returns error and makes no mutation for a PAID order", async () => {
    const { cancelOrderAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrder({ status: "PAID" });
    mockSession = { user: { id: buyer.id } };

    const result = await cancelOrderAction(order.id);

    expect(result).toEqual({ error: "Order cannot be cancelled." });
    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.status).toBe("PAID");
  });

  it("returns error and makes no mutation for a SHIPPED order", async () => {
    const { cancelOrderAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrder({ status: "SHIPPED" });
    mockSession = { user: { id: buyer.id } };

    const result = await cancelOrderAction(order.id);

    expect(result).toEqual({ error: "Order cannot be cancelled." });
    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.status).toBe("SHIPPED");
  });

  it("returns error and makes no mutation for a PROCESSING order", async () => {
    const { cancelOrderAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrder({ status: "PROCESSING" });
    mockSession = { user: { id: buyer.id } };

    const result = await cancelOrderAction(order.id);

    expect(result).toEqual({ error: "Order cannot be cancelled." });
  });

  it("returns Unauthorized when there is no session", async () => {
    const { cancelOrderAction } = await import("@/app/actions/order");
    const { order } = await seedOrder();
    mockSession = null;

    const result = await cancelOrderAction(order.id);

    expect(result).toEqual({ error: "Unauthorized" });
    // Order must remain PENDING
    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.status).toBe("PENDING");
  });

  it("returns Unauthorized when a different buyer tries to cancel", async () => {
    const { cancelOrderAction } = await import("@/app/actions/order");
    const { otherBuyer, order } = await seedOrder();
    mockSession = { user: { id: otherBuyer.id } };

    const result = await cancelOrderAction(order.id);

    expect(result).toEqual({ error: "Unauthorized" });
    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.status).toBe("PENDING");
  });

  it("returns error for a non-existent order without throwing", async () => {
    const { cancelOrderAction } = await import("@/app/actions/order");
    const buyer = await prisma.user.create({
      data: { email: "buyer2@test.com", passwordHash: "x", roles: ["BUYER"] },
    });
    mockSession = { user: { id: buyer.id } };

    const result = await cancelOrderAction("nonexistent-order-id");

    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("does not alter an already-CANCELLED order", async () => {
    const { cancelOrderAction } = await import("@/app/actions/order");
    const { buyer, order } = await seedOrder({ status: "CANCELLED" });
    mockSession = { user: { id: buyer.id } };

    const result = await cancelOrderAction(order.id);

    expect(result).toEqual({ error: "Order cannot be cancelled." });
    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.status).toBe("CANCELLED");
  });
});
