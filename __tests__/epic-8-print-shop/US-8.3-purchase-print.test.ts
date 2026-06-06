import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { createPrintOrder } from "@/lib/print/order";

describe("US-8.3 — Purchase a Print", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedPrintListing() {
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
        printProducts: [
          { sku: "GLOBAL-FAP-16X24", description: "Fine Art Print 16x24", size: "16x24", price: 75 },
        ],
      },
    });
    return { seller, buyer, artwork, originalListing };
  }

  it("creates an order for a print purchase", async () => {
    const { buyer, originalListing } = await seedPrintListing();
    const order = await createPrintOrder({
      buyerId: buyer.id,
      originalListingId: originalListing.id,
      sku: "GLOBAL-FAP-16X24",
      size: "16x24",
      quantity: 1,
      shipping: {
        name: "Buyer",
        line1: "123 Main St",
        city: "Los Angeles",
        state: "CA",
        postal: "90001",
        country: "US",
      },
    });
    expect(order.buyerId).toBe(buyer.id);
    expect(order.originalListingId).toBe(originalListing.id);
    expect(order.prodigiSku).toBe("GLOBAL-FAP-16X24");
    expect(order.listingType).toBe("PRINT");
    expect(Number(order.subtotal)).toBe(75);
  });

  it("submits the order to Prodigi API and stores prodigiOrderId", async () => {
    const { buyer, originalListing } = await seedPrintListing();
    const order = await createPrintOrder({
      buyerId: buyer.id,
      originalListingId: originalListing.id,
      sku: "GLOBAL-FAP-16X24",
      size: "16x24",
      quantity: 1,
      shipping: {
        name: "Buyer",
        line1: "123 Main St",
        city: "Los Angeles",
        state: "CA",
        postal: "90001",
        country: "US",
      },
    });
    expect(order.prodigiOrderId).toBe("ord-test-mock");
  });

  it("rejects order with invalid SKU not in listing products", async () => {
    const { buyer, originalListing } = await seedPrintListing();
    await expect(
      createPrintOrder({
        buyerId: buyer.id,
        originalListingId: originalListing.id,
        sku: "INVALID-SKU",
        size: "16x24",
        quantity: 1,
        shipping: {
          name: "Buyer",
          line1: "123 Main St",
          city: "LA",
          state: "CA",
          postal: "90001",
          country: "US",
        },
      })
    ).rejects.toThrow(/sku|product/i);
  });

  it("stores shipping address on order", async () => {
    const { buyer, originalListing } = await seedPrintListing();
    const order = await createPrintOrder({
      buyerId: buyer.id,
      originalListingId: originalListing.id,
      sku: "GLOBAL-FAP-16X24",
      size: "16x24",
      quantity: 1,
      shipping: {
        name: "Test Buyer",
        line1: "456 Oak Ave",
        city: "Portland",
        state: "OR",
        postal: "97201",
        country: "US",
      },
    });
    expect(order.shippingName).toBe("Test Buyer");
    expect(order.shippingCity).toBe("Portland");
    expect(order.shippingState).toBe("OR");
  });
});
