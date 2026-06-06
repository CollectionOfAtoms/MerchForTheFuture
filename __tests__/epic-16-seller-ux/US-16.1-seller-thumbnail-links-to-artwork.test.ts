import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: { email: "seller16a@test.com", name: "Test Seller", passwordHash: "x", roles: ["SELLER"] as never },
  });
}

async function createListingWithArtwork(sellerId: string) {
  const artwork = await prisma.artwork.create({
    data: {
      sellerId,
      title: "Morning Light",
      description: "A sunrise piece.",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.artworkImage.create({
    data: { artworkId: artwork.id, url: "https://cdn.example.com/morning.jpg", isPrimary: true, order: 0 },
  });
  const listing = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 800, currency: "USD", status: "ACTIVE" },
  });
  return { artwork, listing };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-16.1 — Seller thumbnail links to artwork page", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  it("seller listings query includes artworkId needed to form /artwork/[id] links", async () => {
    const seller = await seedSeller();
    const { artwork, listing } = await createListingWithArtwork(seller.id);

    const listings = await prisma.originalListing.findMany({
      where: { artwork: { sellerId: seller.id } },
      include: {
        artwork: { include: { images: { where: { isPrimary: true }, take: 1 } } },
      },
    });

    expect(listings).toHaveLength(1);
    expect(listings[0].id).toBe(listing.id);
    expect(listings[0].artwork.id).toBe(artwork.id);
  });

  it("artworkId produces a valid /artwork/[id] URL for each listing row", async () => {
    const seller = await seedSeller();
    const { artwork } = await createListingWithArtwork(seller.id);

    const listings = await prisma.originalListing.findMany({
      where: { artwork: { sellerId: seller.id } },
      include: { artwork: true },
    });

    const artworkUrl = `/artwork/${listings[0].artwork.id}`;
    expect(artworkUrl).toBe(`/artwork/${artwork.id}`);
    expect(artworkUrl).toMatch(/^\/artwork\/[a-z0-9]+$/i);
  });

  it("thumbnail URL is accessible from the listing row for display", async () => {
    const seller = await seedSeller();
    const { artwork } = await createListingWithArtwork(seller.id);

    const listings = await prisma.originalListing.findMany({
      where: { artwork: { sellerId: seller.id } },
      include: {
        artwork: { include: { images: { where: { isPrimary: true }, take: 1 } } },
      },
    });

    const primaryImage = listings[0].artwork.images[0];
    expect(primaryImage.url).toBe("https://cdn.example.com/morning.jpg");
    expect(primaryImage.isPrimary).toBe(true);
  });

  it("multiple listings each have a distinct artwork link", async () => {
    const seller = await seedSeller();
    const { artwork: art1 } = await createListingWithArtwork(seller.id);
    const artwork2 = await prisma.artwork.create({
      data: { sellerId: seller.id, title: "Evening Glow", description: "A sunset piece.", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork2.id, url: "https://cdn.example.com/evening.jpg", isPrimary: true, order: 0 },
    });
    await prisma.originalListing.create({
      data: { artworkId: artwork2.id, saleType: "FIXED_PRICE", price: 600, currency: "USD", status: "ACTIVE" },
    });

    const listings = await prisma.originalListing.findMany({
      where: { artwork: { sellerId: seller.id } },
      include: { artwork: true },
      orderBy: { createdAt: "asc" },
    });

    const urls = listings.map((l) => `/artwork/${l.artwork.id}`);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe(`/artwork/${art1.id}`);
    expect(urls[1]).toBe(`/artwork/${artwork2.id}`);
    expect(urls[0]).not.toBe(urls[1]);
  });
});
