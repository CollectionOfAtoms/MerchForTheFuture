import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { createAuction, AuctionConfig } from "@/lib/auctions/configure";

describe("US-3.1 — Configure Auction", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedSellerAndListing() {
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Test Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "AUCTION",
        price: 0,
        currency: "USD",
        status: "ACTIVE",
      },
    });
    return { seller, artwork, listing };
  }

  it("creates an auction with required startBid and endAt", async () => {
    const { listing } = await seedSellerAndListing();
    const endAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const config: AuctionConfig = {
      originalListingId: listing.id,
      startBid: 500,
      endAt,
    };
    const auction = await createAuction(config);
    expect(auction.originalListingId).toBe(listing.id);
    expect(Number(auction.startBid)).toBe(500);
    expect(auction.endAt.toISOString()).toBe(endAt.toISOString());
    expect(auction.reservePrice).toBeNull();
    expect(auction.status).toBe("SCHEDULED");
  });

  it("creates an auction with optional reserve price", async () => {
    const { listing } = await seedSellerAndListing();
    const endAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const auction = await createAuction({
      originalListingId: listing.id,
      startBid: 500,
      reservePrice: 1000,
      endAt,
    });
    expect(Number(auction.reservePrice)).toBe(1000);
  });

  it("rejects auction with duration less than 24 hours", async () => {
    const { listing } = await seedSellerAndListing();
    const endAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await expect(
      createAuction({ originalListingId: listing.id, startBid: 500, endAt })
    ).rejects.toThrow(/24 hours/i);
  });

  it("rejects auction with end date in the past", async () => {
    const { listing } = await seedSellerAndListing();
    const endAt = new Date(Date.now() - 1000);
    await expect(
      createAuction({ originalListingId: listing.id, startBid: 500, endAt })
    ).rejects.toThrow(/future|past|24 hours/i);
  });

  it("rejects auction with zero or negative startBid", async () => {
    const { listing } = await seedSellerAndListing();
    const endAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await expect(
      createAuction({ originalListingId: listing.id, startBid: 0, endAt })
    ).rejects.toThrow(/start bid/i);
  });
});
