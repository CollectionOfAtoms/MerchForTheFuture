import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { createArtwork, publishArtwork, unpublishArtwork, deleteArtwork } from "@/lib/artworks/artwork";
import { createOriginalListing } from "@/lib/artworks/original-listing";

describe("US-1.6 — Remove Listing", () => {
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
      title: "Removable Art",
      description: "This will be removed.",
    });
    artworkId = artwork.id;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("seller can unpublish a published artwork", async () => {
    await publishArtwork(artworkId, sellerId);
    const result = await unpublishArtwork(artworkId, sellerId);
    expect(result.status).toBe("DRAFT");
  });

  it("unpublished artwork no longer appears in published listings", async () => {
    await publishArtwork(artworkId, sellerId);
    await unpublishArtwork(artworkId, sellerId);

    const published = await prisma.artwork.findMany({ where: { status: "PUBLISHED" } });
    expect(published).toHaveLength(0);
  });

  it("seller can permanently delete a draft artwork", async () => {
    await deleteArtwork(artworkId, sellerId);
    const fetched = await prisma.artwork.findUnique({ where: { id: artworkId } });
    expect(fetched).toBeNull();
  });

  it("non-owner cannot unpublish an artwork", async () => {
    const other = await prisma.user.create({
      data: {
        email: "other@example.com",
        passwordHash: "x",
        name: "Other",
        roles: ["SELLER"],
      },
    });
    await publishArtwork(artworkId, sellerId);

    await expect(unpublishArtwork(artworkId, other.id)).rejects.toThrow(/not authorized|forbidden/i);
  });

  it("artworks with completed sales are archived, not deleted", async () => {
    await publishArtwork(artworkId, sellerId);
    const listing = await createOriginalListing({
      artworkId,
      saleType: "FIXED_PRICE",
      price: 500,
      currency: "USD",
    });

    // Simulate a completed sale by marking the listing as SOLD
    await prisma.originalListing.update({
      where: { id: listing.id },
      data: { status: "SOLD" },
    });

    await deleteArtwork(artworkId, sellerId);
    const fetched = await prisma.artwork.findUnique({ where: { id: artworkId } });
    expect(fetched).not.toBeNull();
    expect(fetched?.status).toBe("ARCHIVED");
  });
});
