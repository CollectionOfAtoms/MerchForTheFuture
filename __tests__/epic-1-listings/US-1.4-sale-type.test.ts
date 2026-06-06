import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { createArtwork } from "@/lib/artworks/artwork";
import {
  createOriginalListing,
  setSaleType,
  getOriginalListing,
} from "@/lib/artworks/original-listing";

describe("US-1.4 — Choose Sale Type", () => {
  let sellerId: string;
  let artworkId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: {
        email: "seller@example.com",
        passwordHash: "x",
        name: "Test Seller",
        roles: ["SELLER"],
      },
    });
    sellerId = seller.id;
    const artwork = await createArtwork({
      sellerId,
      title: "Energy Wave",
      description: "Renewable energy art.",
    });
    artworkId = artwork.id;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("creates a FIXED_PRICE original listing", async () => {
    const listing = await createOriginalListing({
      artworkId,
      saleType: "FIXED_PRICE",
      price: 500,
      currency: "USD",
    });

    expect(listing.saleType).toBe("FIXED_PRICE");
    expect(Number(listing.price)).toBe(500);
    expect(listing.currency).toBe("USD");
  });

  it("creates an AUCTION original listing without a price", async () => {
    const listing = await createOriginalListing({
      artworkId,
      saleType: "AUCTION",
      currency: "USD",
    });

    expect(listing.saleType).toBe("AUCTION");
    expect(listing.price).toBeNull();
  });

  it("can change sale type before any bids or purchases", async () => {
    const listing = await createOriginalListing({
      artworkId,
      saleType: "FIXED_PRICE",
      price: 500,
      currency: "USD",
    });

    const updated = await setSaleType(listing.id, "AUCTION");
    expect(updated.saleType).toBe("AUCTION");
  });

  it("rejects a FIXED_PRICE listing without a price", async () => {
    await expect(
      createOriginalListing({ artworkId, saleType: "FIXED_PRICE", currency: "USD" })
    ).rejects.toThrow(/price/i);
  });

  it("retrieves the listing by artwork id", async () => {
    await createOriginalListing({ artworkId, saleType: "FIXED_PRICE", price: 750, currency: "USD" });

    const listing = await getOriginalListing(artworkId);
    expect(listing).not.toBeNull();
    expect(listing?.artworkId).toBe(artworkId);
  });
});
