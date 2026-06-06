import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { browseArtworks } from "@/lib/artworks/browse";

const sellerData = {
  email: "seller72@test.com",
  name: "Filter Seller",
  passwordHash: "hash",
  roles: ["SELLER" as const],
};

const printConfig = {
  availableForPrint: true,
  printSourceImageUrl: "https://cdn.example.com/source.jpg",
  printProducts: [{ sku: "GLOBAL-FAP-16x12", size: "16x12", price: 45 }],
};

async function seedArtwork(
  sellerId: string,
  opts: {
    title: string;
    medium?: string;
    saleType?: "FIXED_PRICE" | "AUCTION";
    price?: number;
    startBid?: number;
    publishedAt?: Date;
    hasPrint?: boolean;
  }
) {
  const artwork = await prisma.artwork.create({
    data: {
      sellerId,
      title: opts.title,
      description: "Test description",
      medium: opts.medium ?? null,
      status: "PUBLISHED",
      publishedAt: opts.publishedAt ?? new Date(),
    },
  });
  await prisma.artworkImage.create({
    data: { artworkId: artwork.id, url: `https://cdn.example.com/${opts.title}.jpg`, isPrimary: true, order: 0 },
  });

  if (opts.saleType === "FIXED_PRICE") {
    await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: opts.price ?? 100,
        currency: "USD",
        ...(opts.hasPrint ? printConfig : {}),
      },
    });
  } else if (opts.saleType === "AUCTION") {
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD" },
    });
    await prisma.auction.create({
      data: {
        originalListingId: listing.id,
        startBid: opts.startBid ?? 50,
        endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  } else if (opts.hasPrint) {
    // Print-only: create a sold original listing with availableForPrint enabled
    await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        currency: "USD",
        status: "SOLD",
        ...printConfig,
      },
    });
  }

  return artwork;
}

describe("US-7.2 — Filter & Sort", () => {
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({ data: sellerData });
    sellerId = seller.id;
  });

  // ── Sale type filter ────────────────────────────────────────────────────────

  it("filters by FIXED_PRICE sale type", async () => {
    await seedArtwork(sellerId, { title: "Fixed", saleType: "FIXED_PRICE", price: 200 });
    await seedArtwork(sellerId, { title: "Auction", saleType: "AUCTION", startBid: 100 });

    const result = await browseArtworks({ filters: { saleType: "FIXED_PRICE" } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Fixed");
  });

  it("filters by AUCTION sale type", async () => {
    await seedArtwork(sellerId, { title: "Fixed", saleType: "FIXED_PRICE", price: 200 });
    await seedArtwork(sellerId, { title: "Auction", saleType: "AUCTION", startBid: 100 });

    const result = await browseArtworks({ filters: { saleType: "AUCTION" } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Auction");
  });

  // ── Availability filter ─────────────────────────────────────────────────────

  it("filters by availability: original only", async () => {
    await seedArtwork(sellerId, { title: "Has Original", saleType: "FIXED_PRICE" });
    await seedArtwork(sellerId, { title: "Print Only", hasPrint: true });

    const result = await browseArtworks({ filters: { availability: "original" } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Has Original");
  });

  it("filters by availability: print only", async () => {
    await seedArtwork(sellerId, { title: "Has Original", saleType: "FIXED_PRICE" });
    await seedArtwork(sellerId, { title: "Print Only", hasPrint: true });

    const result = await browseArtworks({ filters: { availability: "print" } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Print Only");
  });

  it("filters by availability: both original and print", async () => {
    await seedArtwork(sellerId, { title: "Has Both", saleType: "FIXED_PRICE", hasPrint: true });
    await seedArtwork(sellerId, { title: "Original Only", saleType: "FIXED_PRICE" });
    await seedArtwork(sellerId, { title: "Print Only", hasPrint: true });

    const result = await browseArtworks({ filters: { availability: "both" } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Has Both");
  });

  // ── Price range filter ──────────────────────────────────────────────────────

  it("filters by minimum price", async () => {
    await seedArtwork(sellerId, { title: "Cheap", saleType: "FIXED_PRICE", price: 50 });
    await seedArtwork(sellerId, { title: "Expensive", saleType: "FIXED_PRICE", price: 500 });

    const result = await browseArtworks({ filters: { minPrice: 100 } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Expensive");
  });

  it("filters by maximum price", async () => {
    await seedArtwork(sellerId, { title: "Cheap", saleType: "FIXED_PRICE", price: 50 });
    await seedArtwork(sellerId, { title: "Expensive", saleType: "FIXED_PRICE", price: 500 });

    const result = await browseArtworks({ filters: { maxPrice: 100 } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Cheap");
  });

  it("filters by price range (min and max)", async () => {
    await seedArtwork(sellerId, { title: "Too Cheap", saleType: "FIXED_PRICE", price: 25 });
    await seedArtwork(sellerId, { title: "In Range", saleType: "FIXED_PRICE", price: 150 });
    await seedArtwork(sellerId, { title: "Too Expensive", saleType: "FIXED_PRICE", price: 1000 });

    const result = await browseArtworks({ filters: { minPrice: 100, maxPrice: 200 } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("In Range");
  });

  // ── Medium filter ───────────────────────────────────────────────────────────

  it("filters by medium (case-insensitive)", async () => {
    await seedArtwork(sellerId, { title: "Oil Work", medium: "Oil on canvas", saleType: "FIXED_PRICE" });
    await seedArtwork(sellerId, { title: "Watercolor Work", medium: "Watercolor", saleType: "FIXED_PRICE" });

    const result = await browseArtworks({ filters: { medium: "oil" } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Oil Work");
  });

  // ── Combined filters ────────────────────────────────────────────────────────

  it("combines multiple filters", async () => {
    await seedArtwork(sellerId, { title: "Match", saleType: "FIXED_PRICE", price: 200, medium: "Oil on canvas" });
    await seedArtwork(sellerId, { title: "Wrong Medium", saleType: "FIXED_PRICE", price: 200, medium: "Watercolor" });
    await seedArtwork(sellerId, { title: "Wrong Price", saleType: "FIXED_PRICE", price: 10, medium: "Oil on canvas" });

    const result = await browseArtworks({ filters: { saleType: "FIXED_PRICE", medium: "oil", minPrice: 100 } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Match");
  });

  // ── Sort ────────────────────────────────────────────────────────────────────

  it("sorts by newest first (default)", async () => {
    await seedArtwork(sellerId, { title: "Oldest", publishedAt: new Date("2025-01-01"), saleType: "FIXED_PRICE" });
    await seedArtwork(sellerId, { title: "Newest", publishedAt: new Date("2025-06-01"), saleType: "FIXED_PRICE" });

    const result = await browseArtworks({ sort: "newest" });
    expect(result.artworks[0].title).toBe("Newest");
    expect(result.artworks[1].title).toBe("Oldest");
  });

  it("sorts by price ascending", async () => {
    await seedArtwork(sellerId, { title: "Mid", saleType: "FIXED_PRICE", price: 300 });
    await seedArtwork(sellerId, { title: "Low", saleType: "FIXED_PRICE", price: 100 });
    await seedArtwork(sellerId, { title: "High", saleType: "FIXED_PRICE", price: 500 });

    const result = await browseArtworks({ sort: "price_asc" });
    expect(result.artworks.map((a) => a.title)).toEqual(["Low", "Mid", "High"]);
  });

  it("sorts by price descending", async () => {
    await seedArtwork(sellerId, { title: "Mid", saleType: "FIXED_PRICE", price: 300 });
    await seedArtwork(sellerId, { title: "Low", saleType: "FIXED_PRICE", price: 100 });
    await seedArtwork(sellerId, { title: "High", saleType: "FIXED_PRICE", price: 500 });

    const result = await browseArtworks({ sort: "price_desc" });
    expect(result.artworks.map((a) => a.title)).toEqual(["High", "Mid", "Low"]);
  });

  it("sorts auctions by ending soonest", async () => {
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const artworkA = await prisma.artwork.create({ data: { sellerId, title: "Ends Later", description: "D", status: "PUBLISHED", publishedAt: new Date() } });
    await prisma.artworkImage.create({ data: { artworkId: artworkA.id, url: "https://cdn.example.com/a.jpg", isPrimary: true, order: 0 } });
    const listingA = await prisma.originalListing.create({ data: { artworkId: artworkA.id, saleType: "AUCTION", currency: "USD" } });
    await prisma.auction.create({ data: { originalListingId: listingA.id, startBid: 50, endAt: later } });

    const artworkB = await prisma.artwork.create({ data: { sellerId, title: "Ends Soon", description: "D", status: "PUBLISHED", publishedAt: new Date() } });
    await prisma.artworkImage.create({ data: { artworkId: artworkB.id, url: "https://cdn.example.com/b.jpg", isPrimary: true, order: 0 } });
    const listingB = await prisma.originalListing.create({ data: { artworkId: artworkB.id, saleType: "AUCTION", currency: "USD" } });
    await prisma.auction.create({ data: { originalListingId: listingB.id, startBid: 50, endAt: soon } });

    const result = await browseArtworks({ sort: "ending_soonest" });
    expect(result.artworks[0].title).toBe("Ends Soon");
    expect(result.artworks[1].title).toBe("Ends Later");
  });
});
