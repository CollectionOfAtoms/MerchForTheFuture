import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { markListingAsSold } from "@/lib/artworks/fixed-price";
import { browseArtworks } from "@/lib/artworks/browse";

describe("US-2.4 — Auto-Mark as Sold", () => {
  let sellerId: string;
  let listingId: string;
  let artworkId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller24@test.com", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;

    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Will Be Sold", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    artworkId = artwork.id;
    await prisma.artworkImage.create({
      data: { artworkId, url: "https://cdn.example.com/art.jpg", isPrimary: true, order: 0 },
    });

    const listing = await prisma.originalListing.create({
      data: { artworkId, saleType: "FIXED_PRICE", price: 400, currency: "USD" },
    });
    listingId = listing.id;
  });

  it("marks the listing status as SOLD", async () => {
    const updated = await markListingAsSold(listingId);
    expect(updated.status).toBe("SOLD");
  });

  it("still shows the artwork in browse results after being marked sold (no print listing)", async () => {
    const before = await browseArtworks({});
    expect(before.artworks).toHaveLength(1);

    await markListingAsSold(listingId);

    const after = await browseArtworks({});
    expect(after.artworks).toHaveLength(1);
    expect(after.artworks[0].originalStatus).toBe("SOLD");
  });

  it("keeps the artwork in browse results after sold if availableForPrint is enabled", async () => {
    await prisma.originalListing.update({
      where: { id: listingId },
      data: {
        availableForPrint: true,
        printSourceImageUrl: "https://cdn.example.com/source.jpg",
        printProducts: [{ sku: "GLOBAL-FAP-16x12", size: "16x12", price: 45 }],
      },
    });

    await markListingAsSold(listingId);

    const result = await browseArtworks({});
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].originalStatus).toBe("SOLD");
    expect(result.artworks[0].hasPrint).toBe(true);
  });

  it("persists the SOLD status to the database", async () => {
    await markListingAsSold(listingId);

    const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
    expect(listing!.status).toBe("SOLD");
  });

  it("throws when trying to mark a non-existent listing as sold", async () => {
    await expect(markListingAsSold("nonexistent-id")).rejects.toThrow();
  });

  it("throws when trying to mark an already-SOLD listing as sold again", async () => {
    await markListingAsSold(listingId);
    await expect(markListingAsSold(listingId)).rejects.toThrow(/already sold/i);
  });

  it("throws when trying to mark a CANCELLED listing as sold", async () => {
    await prisma.originalListing.update({
      where: { id: listingId },
      data: { status: "CANCELLED" },
    });
    await expect(markListingAsSold(listingId)).rejects.toThrow();
  });
});
