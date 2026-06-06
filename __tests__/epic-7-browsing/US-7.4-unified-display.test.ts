import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { browseArtworks } from "@/lib/artworks/browse";

describe("US-7.4 — Unified Artwork Display", () => {
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller74@test.com", name: "Unified Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;
  });

  async function seedWithImage(title: string) {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title, description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: `https://cdn.example.com/${artwork.id}.jpg`, isPrimary: true, order: 0 },
    });
    return artwork;
  }

  const printConfig = {
    availableForPrint: true,
    printSourceImageUrl: "https://cdn.example.com/source.jpg",
    printProducts: [{ sku: "GLOBAL-FAP-16x12", size: "16x12", price: 45 }],
  };

  it("returns one card per artwork regardless of original or print availability", async () => {
    const artwork = await seedWithImage("Dual Availability");
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 400, currency: "USD", ...printConfig },
    });

    const result = await browseArtworks({});
    expect(result.artworks).toHaveLength(1);
  });

  it("sets hasOriginal: true when an original listing exists", async () => {
    const artwork = await seedWithImage("Original Work");
    await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 300, currency: "USD" } });

    const result = await browseArtworks({});
    expect(result.artworks[0].hasOriginal).toBe(true);
    expect(result.artworks[0].hasPrint).toBe(false);
  });

  it("sets hasPrint: true when availableForPrint is enabled on the listing", async () => {
    const artwork = await seedWithImage("Print Available");
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 300, currency: "USD", ...printConfig },
    });

    const result = await browseArtworks({});
    expect(result.artworks[0].hasOriginal).toBe(true);
    expect(result.artworks[0].hasPrint).toBe(true);
  });

  it("sets both hasOriginal and hasPrint when original has print toggle enabled", async () => {
    const artwork = await seedWithImage("Both");
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 600, currency: "USD", ...printConfig },
    });

    const result = await browseArtworks({});
    expect(result.artworks[0].hasOriginal).toBe(true);
    expect(result.artworks[0].hasPrint).toBe(true);
  });

  it("still shows artwork in browse results when original is SOLD but print is available", async () => {
    const artwork = await seedWithImage("Sold Original with Print");
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 1000, currency: "USD", status: "SOLD", ...printConfig },
    });

    const result = await browseArtworks({});
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].originalStatus).toBe("SOLD");
    expect(result.artworks[0].hasPrint).toBe(true);
  });

  it("still shows artwork when original is SOLD and no print is available", async () => {
    const artwork = await seedWithImage("Sold No Print");
    await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 1000, currency: "USD", status: "SOLD" } });

    const result = await browseArtworks({});
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].originalStatus).toBe("SOLD");
  });

  it("exposes originalStatus field for UI badge rendering", async () => {
    const artwork = await seedWithImage("Active");
    await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 250, currency: "USD", status: "ACTIVE" } });

    const result = await browseArtworks({});
    expect(result.artworks[0].originalStatus).toBe("ACTIVE");
  });

  it("exposes auction current bid for auction artworks", async () => {
    const artwork = await seedWithImage("Live Auction");
    const listing = await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD" } });
    await prisma.auction.create({ data: { originalListingId: listing.id, startBid: 100, currentBid: 350, endAt: new Date(Date.now() + 3600000) } });

    const result = await browseArtworks({});
    expect(result.artworks[0].saleType).toBe("AUCTION");
    expect(result.artworks[0].price).toBe(350);
  });

  it("falls back to startBid when auction has no bids yet", async () => {
    const artwork = await seedWithImage("New Auction");
    const listing = await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD" } });
    await prisma.auction.create({ data: { originalListingId: listing.id, startBid: 75, endAt: new Date(Date.now() + 3600000) } });

    const result = await browseArtworks({});
    expect(result.artworks[0].price).toBe(75);
  });
});
