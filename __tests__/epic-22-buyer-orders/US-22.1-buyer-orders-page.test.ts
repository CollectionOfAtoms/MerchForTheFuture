import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedBuyerWithOrders() {
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
      title: "Solar Flare",
      description: "desc",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  const image = await prisma.artworkImage.create({
    data: {
      artworkId: artwork.id,
      url: "https://cdn.test/solar.jpg",
      thumbnailUrl: "https://cdn.test/solar-thumb.jpg",
      isPrimary: true,
    },
  });

  const listing = await prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: "FIXED_PRICE",
      price: 800.0,
      currency: "USD",
      status: "SOLD",
    },
  });

  // Older ORIGINAL order
  const order1 = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      listingType: "ORIGINAL",
      originalListingId: listing.id,
      subtotal: 800.0,
      taxAmount: 0,
      totalAmount: 800.0,
      currency: "USD",
      status: "PAID",
      createdAt: new Date("2026-05-01T10:00:00Z"),
    },
  });

  // Newer PRINT order (no originalListing link)
  const order2 = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      listingType: "PRINT",
      originalListingId: listing.id,
      externalSku: "GLOBAL-FAP-16X24",
      printSize: "16x24",
      quantity: 1,
      subtotal: 45.0,
      taxAmount: 3.6,
      totalAmount: 48.6,
      currency: "USD",
      status: "PROCESSING",
      createdAt: new Date("2026-05-10T10:00:00Z"),
    },
  });

  // Other buyer's order — must not appear in buyer's list
  const otherOrder = await prisma.order.create({
    data: {
      buyerId: otherBuyer.id,
      listingType: "ORIGINAL",
      originalListingId: listing.id,
      subtotal: 800.0,
      taxAmount: 0,
      totalAmount: 800.0,
      currency: "USD",
      status: "PENDING",
    },
  });

  return { seller, buyer, otherBuyer, artwork, image, listing, order1, order2, otherOrder };
}

// ─── US-22.1: getBuyerOrders ──────────────────────────────────────────────────

describe("US-22.1 — getBuyerOrders", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("returns orders for the buyer sorted newest first", async () => {
    const { getBuyerOrders } = await import("@/lib/orders");
    const { buyer, order1, order2 } = await seedBuyerWithOrders();

    const orders = await getBuyerOrders(buyer.id);

    expect(orders).toHaveLength(2);
    expect(orders[0].id).toBe(order2.id); // newer
    expect(orders[1].id).toBe(order1.id); // older
  });

  it("includes listingType for each order", async () => {
    const { getBuyerOrders } = await import("@/lib/orders");
    const { buyer } = await seedBuyerWithOrders();

    const orders = await getBuyerOrders(buyer.id);

    expect(orders[0].listingType).toBe("PRINT");
    expect(orders[1].listingType).toBe("ORIGINAL");
  });

  it("includes artwork title and thumbnailUrl for ORIGINAL orders", async () => {
    const { getBuyerOrders } = await import("@/lib/orders");
    const { buyer } = await seedBuyerWithOrders();

    const orders = await getBuyerOrders(buyer.id);
    const originalOrder = orders.find((o) => o.listingType === "ORIGINAL");

    expect(originalOrder?.artwork?.title).toBe("Solar Flare");
    expect(originalOrder?.artwork?.thumbnailUrl).toBe("https://cdn.test/solar-thumb.jpg");
  });

  it("includes artwork for PRINT orders that have an originalListing", async () => {
    const { getBuyerOrders } = await import("@/lib/orders");
    const { buyer } = await seedBuyerWithOrders();

    const orders = await getBuyerOrders(buyer.id);
    const printOrder = orders.find((o) => o.listingType === "PRINT");

    // Print orders linked to a listing still expose the artwork title
    expect(printOrder?.artwork?.title).toBe("Solar Flare");
  });

  it("returns null artwork for print orders with no originalListingId", async () => {
    const { getBuyerOrders } = await import("@/lib/orders");
    const { buyer } = await seedBuyerWithOrders();

    // Create a print order with no listing link
    await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "PRINT",
        externalSku: "GLOBAL-FAP-8X10",
        printSize: "8x10",
        quantity: 1,
        subtotal: 25.0,
        taxAmount: 2.0,
        totalAmount: 27.0,
        currency: "USD",
        status: "PENDING",
        createdAt: new Date("2026-05-15T10:00:00Z"),
      },
    });

    const orders = await getBuyerOrders(buyer.id);
    const orphanOrder = orders.find((o) => o.listingType === "PRINT" && !o.artwork);

    expect(orphanOrder).toBeDefined();
    expect(orphanOrder?.artwork).toBeNull();
  });

  it("returns empty array when buyer has no orders", async () => {
    const { getBuyerOrders } = await import("@/lib/orders");
    const buyer = await prisma.user.create({
      data: { email: "newbuyer@test.com", passwordHash: "x", roles: ["BUYER"] },
    });

    const orders = await getBuyerOrders(buyer.id);

    expect(orders).toHaveLength(0);
  });

  it("does not return orders belonging to other buyers", async () => {
    const { getBuyerOrders } = await import("@/lib/orders");
    const { buyer, otherBuyer } = await seedBuyerWithOrders();

    const buyerOrders = await getBuyerOrders(buyer.id);
    const otherOrders = await getBuyerOrders(otherBuyer.id);

    expect(buyerOrders).toHaveLength(2);
    expect(otherOrders).toHaveLength(1);

    const buyerIds = buyerOrders.map((o) => o.id);
    const otherIds = otherOrders.map((o) => o.id);
    expect(buyerIds).not.toEqual(expect.arrayContaining(otherIds));
  });

  it("includes totalAmount and status on each order", async () => {
    const { getBuyerOrders } = await import("@/lib/orders");
    const { buyer } = await seedBuyerWithOrders();

    const orders = await getBuyerOrders(buyer.id);
    const printOrder = orders.find((o) => o.listingType === "PRINT")!;

    expect(Number(printOrder.totalAmount)).toBeCloseTo(48.6, 1);
    expect(printOrder.status).toBe("PROCESSING");
  });
});
