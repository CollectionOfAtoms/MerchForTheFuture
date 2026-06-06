import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { setPrice } from "@/lib/artworks/fixed-price";

describe("US-2.1 — Set Price", () => {
  let listingId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller21@test.com", passwordHash: "hash", roles: ["SELLER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { sellerId: seller.id, title: "Priced Work", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, currency: "USD" },
    });
    listingId = listing.id;
  });

  it("sets a valid price on a fixed-price listing", async () => {
    const updated = await setPrice(listingId, 450, "USD");
    expect(Number(updated.price)).toBe(450);
    expect(updated.currency).toBe("USD");
  });

  it("updates an already-priced listing with a new price", async () => {
    await setPrice(listingId, 300, "USD");
    const updated = await setPrice(listingId, 500, "USD");
    expect(Number(updated.price)).toBe(500);
  });

  it("stores the currency alongside the price", async () => {
    const updated = await setPrice(listingId, 200, "GBP");
    expect(updated.currency).toBe("GBP");
  });

  it("rejects a price of zero", async () => {
    await expect(setPrice(listingId, 0, "USD")).rejects.toThrow();
  });

  it("rejects a negative price", async () => {
    await expect(setPrice(listingId, -50, "USD")).rejects.toThrow();
  });

  it("rejects a non-numeric price (NaN)", async () => {
    await expect(setPrice(listingId, NaN, "USD")).rejects.toThrow();
  });

  it("throws when the listing does not exist", async () => {
    await expect(setPrice("nonexistent-id", 100, "USD")).rejects.toThrow();
  });

  it("throws when attempting to set price on a SOLD listing", async () => {
    await prisma.originalListing.update({
      where: { id: listingId },
      data: { status: "SOLD" },
    });
    await expect(setPrice(listingId, 999, "USD")).rejects.toThrow(/sold/i);
  });

  it("throws when attempting to set price on an AUCTION listing", async () => {
    const seller = await prisma.user.create({
      data: { email: "seller21b@test.com", passwordHash: "hash", roles: ["SELLER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { sellerId: seller.id, title: "Auction Work", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    const auctionListing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD" },
    });
    await expect(setPrice(auctionListing.id, 100, "USD")).rejects.toThrow(/auction/i);
  });
});
