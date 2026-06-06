import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { getArtworkDetail } from "@/lib/artworks/detail";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: { email: "seller10b@test.com", name: "Detail Seller", passwordHash: "x", roles: ["SELLER"] as never },
  });
}

async function createArtwork(sellerId: string, opts: { title?: string; status?: "DRAFT" | "PUBLISHED" | "ARCHIVED" } = {}) {
  const { title = "Test Artwork", status = "PUBLISHED" } = opts;
  return prisma.artwork.create({
    data: {
      sellerId,
      title,
      description: "A detailed description of the artwork.",
      medium: "Oil on canvas",
      dimensions: "24 x 36 in",
      year: 2023,
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
    },
  });
}

async function attachImages(artworkId: string) {
  await prisma.artworkImage.create({
    data: { artworkId, url: "https://cdn.example.com/primary.jpg", isPrimary: true, order: 0 },
  });
  await prisma.artworkImage.create({
    data: { artworkId, url: "https://cdn.example.com/secondary.jpg", isPrimary: false, order: 1 },
  });
}

async function createFixedPriceListing(artworkId: string, opts: { price?: number; status?: string } = {}) {
  const { price = 1200, status = "ACTIVE" } = opts;
  return prisma.originalListing.create({
    data: { artworkId, saleType: "FIXED_PRICE", price, currency: "USD", status: status as never },
  });
}

async function createAuctionListing(
  artworkId: string,
  opts: {
    startBid?: number;
    currentBid?: number | null;
    currentBidderId?: string | null;
    bidCount?: number;
    auctionStatus?: "SCHEDULED" | "ACTIVE" | "CLOSED" | "CANCELLED";
    listingStatus?: string;
  } = {}
) {
  const {
    startBid = 200,
    currentBid = null,
    currentBidderId = null,
    bidCount = 0,
    auctionStatus = "ACTIVE",
    listingStatus = "ACTIVE",
  } = opts;
  const listing = await prisma.originalListing.create({
    data: { artworkId, saleType: "AUCTION", price: startBid, currency: "USD", status: listingStatus as never },
  });
  const auction = await prisma.auction.create({
    data: {
      originalListingId: listing.id,
      startBid,
      currentBid,
      currentBidderId,
      bidCount,
      endAt: new Date(Date.now() + 86400000),
      status: auctionStatus,
    },
  });
  return { listing, auction };
}

async function enablePrintOnListing(listingId: string) {
  return prisma.originalListing.update({
    where: { id: listingId },
    data: {
      availableForPrint: true,
      printSourceImageUrl: "https://cdn.example.com/hires.jpg",
      printProducts: [{ sku: "GLOBAL-FAP-16x24", price: 45 }],
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-10.2 — Listing Detail Page", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  describe("Integration: getArtworkDetail — not found / access guard", () => {
    it("returns null for an unknown artwork id", async () => {
      const result = await getArtworkDetail("nonexistent-id");
      expect(result).toBeNull();
    });

    it("returns null for a DRAFT artwork", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id, { status: "DRAFT" });
      const result = await getArtworkDetail(artwork.id);
      expect(result).toBeNull();
    });

    it("returns null for an ARCHIVED artwork", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id, { status: "ARCHIVED" });
      const result = await getArtworkDetail(artwork.id);
      expect(result).toBeNull();
    });
  });

  describe("Integration: getArtworkDetail — artwork fields", () => {
    it("returns core artwork fields: title, description, medium, dimensions, year", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id, { title: "Sunlit Meadow" });
      const result = await getArtworkDetail(artwork.id);

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Sunlit Meadow");
      expect(result!.description).toBe("A detailed description of the artwork.");
      expect(result!.medium).toBe("Oil on canvas");
      expect(result!.dimensions).toBe("24 x 36 in");
      expect(result!.year).toBe(2023);
    });

    it("returns artist name when set", async () => {
      const seller = await seedSeller();
      const artwork = await prisma.artwork.create({
        data: { sellerId: seller.id, title: "Named Work", description: "desc", artist: "Frida Kahlo", status: "PUBLISHED", publishedAt: new Date() },
      });
      await prisma.artworkImage.create({ data: { artworkId: artwork.id, url: "https://cdn.example.com/a.jpg", isPrimary: true, order: 0 } });
      const result = await getArtworkDetail(artwork.id);
      expect(result!.artist).toBe("Frida Kahlo");
    });

    it("returns null artist when not set", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id);
      const result = await getArtworkDetail(artwork.id);
      expect(result!.artist).toBeNull();
    });

    it("returns all images sorted by order ascending", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id);
      await attachImages(artwork.id);

      const result = await getArtworkDetail(artwork.id);
      expect(result!.images).toHaveLength(2);
      expect(result!.images[0].url).toBe("https://cdn.example.com/primary.jpg");
      expect(result!.images[0].isPrimary).toBe(true);
      expect(result!.images[1].url).toBe("https://cdn.example.com/secondary.jpg");
      expect(result!.images[1].order).toBe(1);
    });
  });

  describe("Integration: getArtworkDetail — fixed-price original listing", () => {
    it("returns original listing fields for a fixed-price listing", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id);
      await createFixedPriceListing(artwork.id, { price: 850 });

      const result = await getArtworkDetail(artwork.id);
      expect(result!.original).not.toBeNull();
      expect(result!.original!.saleType).toBe("FIXED_PRICE");
      expect(result!.original!.price).toBe(850);
      expect(result!.original!.currency).toBe("USD");
      expect(result!.original!.status).toBe("ACTIVE");
    });

    it("returns null for auction fields on a fixed-price listing", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id);
      await createFixedPriceListing(artwork.id);

      const result = await getArtworkDetail(artwork.id);
      expect(result!.original!.auctionId).toBeNull();
      expect(result!.original!.startBid).toBeNull();
      expect(result!.original!.currentBid).toBeNull();
      expect(result!.original!.bidCount).toBeNull();
      expect(result!.original!.auctionEndAt).toBeNull();
      expect(result!.original!.auctionStatus).toBeNull();
    });

    it("returns original.status: SOLD for a sold listing", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id);
      await createFixedPriceListing(artwork.id, { status: "SOLD" });

      const result = await getArtworkDetail(artwork.id);
      expect(result!.original!.status).toBe("SOLD");
    });
  });

  describe("Integration: getArtworkDetail — auction original listing", () => {
    it("returns auction fields: startBid, currentBid, bidCount, auctionEndAt, auctionStatus", async () => {
      const seller = await seedSeller();
      const buyer = await prisma.user.create({
        data: { email: "bidder@test.com", name: "Bidder", passwordHash: "x", roles: ["BUYER"] as never },
      });
      const artwork = await createArtwork(seller.id);
      await createAuctionListing(artwork.id, {
        startBid: 300,
        currentBid: 450,
        currentBidderId: buyer.id,
        bidCount: 3,
        auctionStatus: "ACTIVE",
      });

      const result = await getArtworkDetail(artwork.id);
      const orig = result!.original!;
      expect(orig.saleType).toBe("AUCTION");
      expect(orig.startBid).toBe(300);
      expect(Number(orig.currentBid)).toBe(450);
      expect(orig.bidCount).toBe(3);
      expect(orig.auctionEndAt).toBeInstanceOf(Date);
      expect(orig.auctionStatus).toBe("ACTIVE");
    });

    it("returns startBid as currentBid equivalent when no bids placed yet", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id);
      await createAuctionListing(artwork.id, { startBid: 150, currentBid: null, bidCount: 0 });

      const result = await getArtworkDetail(artwork.id);
      const orig = result!.original!;
      expect(orig.startBid).toBe(150);
      expect(orig.currentBid).toBeNull();
      expect(orig.bidCount).toBe(0);
    });
  });

  describe("Integration: getArtworkDetail — print availability", () => {
    it("returns availableForPrint: false when no print config is set", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id);
      await createFixedPriceListing(artwork.id);

      const result = await getArtworkDetail(artwork.id);
      expect(result!.original!.availableForPrint).toBe(false);
      expect(result!.original!.printProducts).toBeNull();
    });

    it("returns print config from OriginalListing when availableForPrint is enabled", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id);
      const listing = await createFixedPriceListing(artwork.id);
      await enablePrintOnListing(listing.id);

      const result = await getArtworkDetail(artwork.id);
      expect(result!.original!.availableForPrint).toBe(true);
      expect(result!.original!.printSourceImageUrl).toBe("https://cdn.example.com/hires.jpg");
      expect(Array.isArray(result!.original!.printProducts)).toBe(true);
    });

    it("returns print config even when the original is sold", async () => {
      const seller = await seedSeller();
      const artwork = await createArtwork(seller.id);
      const listing = await createFixedPriceListing(artwork.id, { status: "SOLD" });
      await enablePrintOnListing(listing.id);

      const result = await getArtworkDetail(artwork.id);
      expect(result!.original!.status).toBe("SOLD");
      expect(result!.original!.availableForPrint).toBe(true);
    });
  });
});
