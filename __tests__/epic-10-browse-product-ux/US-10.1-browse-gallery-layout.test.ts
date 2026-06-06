import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { browseArtworks } from "@/lib/artworks/browse";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: { email: "seller10@test.com", name: "Gallery Seller", passwordHash: "x", roles: ["SELLER"] as never },
  });
}

async function createPublishedArtwork(sellerId: string, title = "Test Artwork") {
  return prisma.artwork.create({
    data: { sellerId, title, description: "A fine piece", status: "PUBLISHED", publishedAt: new Date() },
  });
}

async function attachImage(artworkId: string, url = "https://cdn.example.com/art.jpg", isPrimary = true) {
  return prisma.artworkImage.create({
    data: { artworkId, url, isPrimary, order: 0 },
  });
}

async function createFixedListing(artworkId: string, status: "ACTIVE" | "ARCHIVED" | "SOLD" = "ACTIVE") {
  return prisma.originalListing.create({
    data: { artworkId, saleType: "FIXED_PRICE", price: 500, currency: "USD", status },
  });
}

async function createAuctionListing(artworkId: string, status: "ACTIVE" | "ARCHIVED" | "SOLD" = "ACTIVE") {
  const listing = await prisma.originalListing.create({
    data: { artworkId, saleType: "AUCTION", price: 100, currency: "USD", status },
  });
  await prisma.auction.create({
    data: {
      originalListingId: listing.id,
      startBid: 100,
      endAt: new Date(Date.now() + 86400000),
      status: "ACTIVE",
    },
  });
  return listing;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-10.1 — Browse Gallery Layout", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  describe("Integration: browseArtworks — active listing filter", () => {
    it("returns artwork whose listing status is ACTIVE", async () => {
      const seller = await seedSeller();
      const artwork = await createPublishedArtwork(seller.id, "Active Piece");
      await attachImage(artwork.id);
      await createFixedListing(artwork.id, "ACTIVE");

      const result = await browseArtworks({});
      expect(result.artworks).toHaveLength(1);
      expect(result.artworks[0].title).toBe("Active Piece");
    });

    it("excludes artwork whose listing status is ARCHIVED", async () => {
      const seller = await seedSeller();
      const artwork = await createPublishedArtwork(seller.id, "Archived Piece");
      await attachImage(artwork.id);
      await createFixedListing(artwork.id, "ARCHIVED");

      const result = await browseArtworks({});
      expect(result.artworks).toHaveLength(0);
    });

    it("includes artwork whose listing status is SOLD (remains visible for print orders)", async () => {
      const seller = await seedSeller();
      const artwork = await createPublishedArtwork(seller.id, "Sold Piece");
      await attachImage(artwork.id);
      await createFixedListing(artwork.id, "SOLD");

      const result = await browseArtworks({});
      expect(result.artworks).toHaveLength(1);
      expect(result.artworks[0].originalStatus).toBe("SOLD");
    });

    it("includes sold artwork when availableForPrint is enabled", async () => {
      const seller = await seedSeller();
      const artwork = await createPublishedArtwork(seller.id, "Sold But Printable");
      await attachImage(artwork.id);
      const listing = await createFixedListing(artwork.id, "SOLD");
      await prisma.originalListing.update({
        where: { id: listing.id },
        data: {
          availableForPrint: true,
          printSourceImageUrl: "https://cdn.example.com/hires.jpg",
          printProducts: [{ sku: "GLOBAL-FAP-16x12", size: "16x12", price: 45 }],
        },
      });

      const result = await browseArtworks({});
      expect(result.artworks).toHaveLength(1);
      expect(result.artworks[0].title).toBe("Sold But Printable");
    });

    it("returns active auction listings alongside fixed-price listings", async () => {
      const seller = await seedSeller();
      const art1 = await createPublishedArtwork(seller.id, "Fixed");
      const art2 = await createPublishedArtwork(seller.id, "Auction");
      await attachImage(art1.id);
      await attachImage(art2.id);
      await createFixedListing(art1.id, "ACTIVE");
      await createAuctionListing(art2.id, "ACTIVE");

      const result = await browseArtworks({});
      expect(result.artworks).toHaveLength(2);
    });
  });

  describe("Integration: browseArtworks — card fields for gallery tiles", () => {
    it("each card includes an id field suitable for /artwork/[id] links", async () => {
      const seller = await seedSeller();
      const artwork = await createPublishedArtwork(seller.id);
      await attachImage(artwork.id);
      await createFixedListing(artwork.id);

      const result = await browseArtworks({});
      expect(result.artworks[0].id).toBe(artwork.id);
      expect(typeof result.artworks[0].id).toBe("string");
      expect(result.artworks[0].id.length).toBeGreaterThan(0);
    });

    it("each card includes primaryImageUrl as the tile thumbnail", async () => {
      const seller = await seedSeller();
      const artwork = await createPublishedArtwork(seller.id);
      await attachImage(artwork.id, "https://cdn.example.com/thumb.jpg", true);
      await createFixedListing(artwork.id);

      const result = await browseArtworks({});
      expect(result.artworks[0].primaryImageUrl).toBe("https://cdn.example.com/thumb.jpg");
    });

    it("each card includes title, artist, price, saleType for display", async () => {
      const seller = await seedSeller();
      const artwork = await prisma.artwork.create({
        data: { sellerId: seller.id, title: "Sunlit Horizon", description: "A fine piece", artist: "Claude Monet", status: "PUBLISHED", publishedAt: new Date() },
      });
      await attachImage(artwork.id);
      await createFixedListing(artwork.id);

      const result = await browseArtworks({});
      const card = result.artworks[0];
      expect(card.title).toBe("Sunlit Horizon");
      expect(card.artist).toBe("Claude Monet");
      expect(card.price).toBe(500);
      expect(card.saleType).toBe("FIXED_PRICE");
    });
  });

  describe("Integration: browseArtworks — pagination", () => {
    it("returns pagination metadata: page, total, totalPages", async () => {
      const seller = await seedSeller();
      for (let i = 0; i < 5; i++) {
        const art = await createPublishedArtwork(seller.id, `Piece ${i}`);
        await attachImage(art.id);
        await createFixedListing(art.id);
      }

      const result = await browseArtworks({ page: 1, limit: 3 });
      expect(result.page).toBe(1);
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(2);
      expect(result.artworks).toHaveLength(3);
    });

    it("returns the correct second page", async () => {
      const seller = await seedSeller();
      for (let i = 0; i < 5; i++) {
        const art = await createPublishedArtwork(seller.id, `Piece ${i}`);
        await attachImage(art.id);
        await createFixedListing(art.id);
      }

      const page2 = await browseArtworks({ page: 2, limit: 3 });
      expect(page2.page).toBe(2);
      expect(page2.artworks).toHaveLength(2);
    });

    it("returns totalPages: 0 when no listings are active", async () => {
      const result = await browseArtworks({});
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.artworks).toHaveLength(0);
    });
  });
});
