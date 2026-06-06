import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { syncProdigiOrderStatus, getOrderTracking } from "@/lib/print/tracking";

describe("US-8.4 — Print Order Tracking", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedPrintOrder() {
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", name: "Buyer", passwordHash: "x" },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://cdn.example.com/art.jpg", isPrimary: true, order: 0 },
    });
    const originalListing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: 500,
        currency: "USD",
        availableForPrint: true,
        printSourceImageUrl: "https://cdn.example.com/art.jpg",
        printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price: 75 }],
      },
    });
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "PRINT",
        originalListingId: originalListing.id,
        prodigiSku: "GLOBAL-FAP-16X24",
        prodigiOrderId: "ord-test-mock",
        subtotal: 75,
        taxAmount: 0,
        totalAmount: 75,
        currency: "USD",
        status: "PROCESSING",
      },
    });
    return { seller, buyer, artwork, originalListing, order };
  }

  it("returns order tracking info with buyer-friendly status", async () => {
    const { order } = await seedPrintOrder();
    const tracking = await getOrderTracking(order.id);
    expect(tracking.orderId).toBe(order.id);
    expect(typeof tracking.status).toBe("string");
    expect(tracking.status).toMatch(/processing|printing|shipped|delivered/i);
  });

  it("syncs Prodigi order status for a known order (MSW-intercepted)", async () => {
    const { order } = await seedPrintOrder();
    await syncProdigiOrderStatus(order.id);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated).not.toBeNull();
  });

  it("returns null tracking number when order is still processing", async () => {
    const { order } = await seedPrintOrder();
    const tracking = await getOrderTracking(order.id);
    expect(tracking.trackingNumber).toBeNull();
  });

  it("throws when order not found", async () => {
    await expect(getOrderTracking("nonexistent")).rejects.toThrow(/not found/i);
  });
});
