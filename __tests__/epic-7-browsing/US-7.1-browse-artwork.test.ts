import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { browseArtworks } from "@/lib/artworks/browse";

const sellerData = {
  email: "seller7@test.com",
  name: "Test Seller",
  passwordHash: "hash",
  roles: ["SELLER" as const],
};

describe("US-7.1 — Browse Artwork", () => {
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({ data: sellerData });
    sellerId = seller.id;
  });

  it("returns only PUBLISHED artworks, not drafts or archived", async () => {
    const published = await prisma.artwork.create({
      data: { sellerId, title: "Published", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.artworkImage.create({ data: { artworkId: published.id, url: "https://cdn.example.com/p.jpg", isPrimary: true, order: 0 } });
    await prisma.artwork.create({
      data: { sellerId, title: "Draft", description: "D", status: "DRAFT" },
    });
    await prisma.artwork.create({
      data: { sellerId, title: "Archived", description: "D", status: "ARCHIVED" },
    });

    const result = await browseArtworks({});
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Published");
  });

  it("includes required card fields: id, title, artist, primaryImageUrl, price, saleType, currency", async () => {
    const artwork = await prisma.artwork.create({
      data: {
        sellerId,
        title: "Ocean at Dusk",
        description: "A seascape",
        medium: "Oil on canvas",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://cdn.example.com/ocean.jpg", isPrimary: true, order: 0 },
    });
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 850, currency: "USD" },
    });

    const result = await browseArtworks({});
    const card = result.artworks[0];

    expect(card.id).toBe(artwork.id);
    expect(card.title).toBe("Ocean at Dusk");
    expect(card.artist).toBeNull();
    expect(card.primaryImageUrl).toBe("https://cdn.example.com/ocean.jpg");
    expect(card.price).toBe(850);
    expect(card.saleType).toBe("FIXED_PRICE");
    expect(card.currency).toBe("USD");
  });

  it("excludes artworks with no images from browse results", async () => {
    await prisma.artwork.create({
      data: { sellerId, title: "No Image", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });

    const result = await browseArtworks({});
    expect(result.artworks).toHaveLength(0);
  });

  it("uses the primary image, not the first by insertion order", async () => {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Multi-image", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://cdn.example.com/secondary.jpg", isPrimary: false, order: 1 },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://cdn.example.com/primary.jpg", isPrimary: true, order: 0 },
    });

    const result = await browseArtworks({});
    expect(result.artworks[0].primaryImageUrl).toBe("https://cdn.example.com/primary.jpg");
  });

  it("returns correct pagination metadata", async () => {
    for (let i = 0; i < 5; i++) {
      const art = await prisma.artwork.create({
        data: {
          sellerId,
          title: `Work ${i}`,
          description: "D",
          status: "PUBLISHED",
          publishedAt: new Date(Date.now() + i * 1000),
        },
      });
      await prisma.artworkImage.create({ data: { artworkId: art.id, url: `https://cdn.example.com/${i}.jpg`, isPrimary: true, order: 0 } });
    }

    const result = await browseArtworks({ page: 1, limit: 3 });
    expect(result.artworks).toHaveLength(3);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  it("returns the second page of results", async () => {
    for (let i = 0; i < 5; i++) {
      const art = await prisma.artwork.create({
        data: {
          sellerId,
          title: `Work ${i}`,
          description: "D",
          status: "PUBLISHED",
          publishedAt: new Date(Date.now() + i * 1000),
        },
      });
      await prisma.artworkImage.create({ data: { artworkId: art.id, url: `https://cdn.example.com/${i}.jpg`, isPrimary: true, order: 0 } });
    }

    const page2 = await browseArtworks({ page: 2, limit: 3 });
    expect(page2.artworks).toHaveLength(2);
    expect(page2.page).toBe(2);
  });

  it("returns empty results when no published artworks exist", async () => {
    const result = await browseArtworks({});
    expect(result.artworks).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });
});
