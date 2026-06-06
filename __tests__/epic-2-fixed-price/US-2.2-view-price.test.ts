import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { getProductListing } from "@/lib/artworks/fixed-price";

describe("US-2.2 — View Price", () => {
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller22@test.com", name: "Price Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;
  });

  it("returns price and currency for a fixed-price listing", async () => {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Priced Art", description: "Oil painting", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 750, currency: "USD" },
    });

    const listing = await getProductListing(artwork.id);
    expect(listing).not.toBeNull();
    expect(listing!.price).toBe(750);
    expect(listing!.currency).toBe("USD");
  });

  it("returns saleType so the UI knows which price display to render", async () => {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Sale Type Art", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 300, currency: "USD" },
    });

    const listing = await getProductListing(artwork.id);
    expect(listing!.saleType).toBe("FIXED_PRICE");
  });

  it("returns current listing status for sold/available badge", async () => {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Status Art", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 200, currency: "USD", status: "ACTIVE" },
    });

    const listing = await getProductListing(artwork.id);
    expect(listing!.status).toBe("ACTIVE");
  });

  it("returns null when no original listing exists for the artwork", async () => {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "No Listing", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });

    const listing = await getProductListing(artwork.id);
    expect(listing).toBeNull();
  });

  it("includes the artwork title and seller name for display", async () => {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Named Work", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 600, currency: "USD" },
    });

    const listing = await getProductListing(artwork.id);
    expect(listing!.artwork.title).toBe("Named Work");
    expect(listing!.artwork.sellerName).toBe("Price Seller");
  });

  it("returns SOLD status correctly for sold listings", async () => {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Sold Art", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 900, currency: "USD", status: "SOLD" },
    });

    const listing = await getProductListing(artwork.id);
    expect(listing!.status).toBe("SOLD");
    expect(listing!.price).toBe(900);
  });
});
