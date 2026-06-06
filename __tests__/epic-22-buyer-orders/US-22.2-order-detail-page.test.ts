import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedOrderScenario(overrides?: {
  orderStatus?: string;
  shippingSet?: boolean;
  trackingSet?: boolean;
  listingType?: "ORIGINAL" | "PRINT";
  noListing?: boolean;
}) {
  const seller = await prisma.user.create({
    data: {
      email: "seller@test.com",
      passwordHash: "x",
      roles: ["SELLER"],
      name: "Alex Rivera",
    },
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
      title: "Wind Turbine Study",
      artist: "Alex Rivera",
      description: "desc",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  await prisma.artworkImage.create({
    data: {
      artworkId: artwork.id,
      url: "https://cdn.test/wind.jpg",
      thumbnailUrl: "https://cdn.test/wind-thumb.jpg",
      isPrimary: true,
    },
  });

  const listing = await prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: "FIXED_PRICE",
      price: 1200.0,
      currency: "USD",
      status: "SOLD",
    },
  });

  const shippingFields =
    overrides?.shippingSet
      ? {
          shippingName: "Jane Buyer",
          shippingLine1: "123 Main St",
          shippingCity: "Austin",
          shippingState: "TX",
          shippingPostal: "78701",
          shippingCountry: "US",
        }
      : {};

  const trackingFields =
    overrides?.trackingSet
      ? { carrier: "UPS", trackingNumber: "1Z999AA10123456784" }
      : {};

  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      listingType: overrides?.listingType ?? "ORIGINAL",
      originalListingId: overrides?.noListing ? undefined : listing.id,
      subtotal: 1200.0,
      taxAmount: 96.0,
      totalAmount: 1296.0,
      currency: "USD",
      status: (overrides?.orderStatus ?? "PAID") as string,
      ...shippingFields,
      ...trackingFields,
    },
  });

  return { seller, buyer, otherBuyer, artwork, listing, order };
}

// ─── US-22.2: getOrderDetail ──────────────────────────────────────────────────

describe("US-22.2 — getOrderDetail", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("returns full order detail for the owning buyer", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer, order } = await seedOrderScenario();

    const detail = await getOrderDetail(order.id, buyer.id);

    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(order.id);
    expect(detail!.status).toBe("PAID");
    expect(Number(detail!.totalAmount)).toBeCloseTo(1296.0, 1);
    expect(detail!.listingType).toBe("ORIGINAL");
  });

  it("returns null when the order belongs to a different buyer", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { otherBuyer, order } = await seedOrderScenario();

    const detail = await getOrderDetail(order.id, otherBuyer.id);

    expect(detail).toBeNull();
  });

  it("returns null for a completely unknown orderId", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer } = await seedOrderScenario();

    const detail = await getOrderDetail("nonexistent-id", buyer.id);

    expect(detail).toBeNull();
  });

  it("includes artwork title and artist name", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer, order } = await seedOrderScenario();

    const detail = await getOrderDetail(order.id, buyer.id);

    expect(detail!.artwork?.title).toBe("Wind Turbine Study");
    expect(detail!.artwork?.artist).toBe("Alex Rivera");
  });

  it("includes seller email via artwork → seller relation", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer, order } = await seedOrderScenario();

    const detail = await getOrderDetail(order.id, buyer.id);

    expect(detail!.artwork?.sellerEmail).toBe("seller@test.com");
  });

  it("includes artwork thumbnailUrl from primary image", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer, order } = await seedOrderScenario();

    const detail = await getOrderDetail(order.id, buyer.id);

    expect(detail!.artwork?.thumbnailUrl).toBe("https://cdn.test/wind-thumb.jpg");
  });

  it("includes shipping address fields when confirmed", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer, order } = await seedOrderScenario({ shippingSet: true });

    const detail = await getOrderDetail(order.id, buyer.id);

    expect(detail!.shippingName).toBe("Jane Buyer");
    expect(detail!.shippingLine1).toBe("123 Main St");
    expect(detail!.shippingCity).toBe("Austin");
    expect(detail!.shippingState).toBe("TX");
    expect(detail!.shippingPostal).toBe("78701");
    expect(detail!.shippingCountry).toBe("US");
  });

  it("has null shipping fields when shipping is not yet confirmed", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer, order } = await seedOrderScenario({ shippingSet: false });

    const detail = await getOrderDetail(order.id, buyer.id);

    expect(detail!.shippingName).toBeNull();
    expect(detail!.shippingLine1).toBeNull();
  });

  it("includes carrier and trackingNumber for SHIPPED orders", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer, order } = await seedOrderScenario({
      orderStatus: "SHIPPED",
      shippingSet: true,
      trackingSet: true,
    });

    const detail = await getOrderDetail(order.id, buyer.id);

    expect(detail!.status).toBe("SHIPPED");
    expect(detail!.carrier).toBe("UPS");
    expect(detail!.trackingNumber).toBe("1Z999AA10123456784");
  });

  it("has null tracking fields when not yet shipped", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer, order } = await seedOrderScenario();

    const detail = await getOrderDetail(order.id, buyer.id);

    expect(detail!.carrier).toBeNull();
    expect(detail!.trackingNumber).toBeNull();
  });

  it("returns null artwork for a PRINT order with no originalListing", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer } = await seedOrderScenario();

    const orphanOrder = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "PRINT",
        prodigiSku: "GLOBAL-FAP-8X10",
        printSize: "8x10",
        quantity: 1,
        subtotal: 25.0,
        taxAmount: 2.0,
        totalAmount: 27.0,
        currency: "USD",
        status: "PENDING",
      },
    });

    const detail = await getOrderDetail(orphanOrder.id, buyer.id);

    expect(detail).not.toBeNull();
    expect(detail!.artwork).toBeNull();
  });

  it("includes createdAt date on the order", async () => {
    const { getOrderDetail } = await import("@/lib/orders");
    const { buyer, order } = await seedOrderScenario();

    const detail = await getOrderDetail(order.id, buyer.id);

    expect(detail!.createdAt).toBeInstanceOf(Date);
  });
});
