import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { createArtwork, updateArtwork, publishArtwork } from "@/lib/artworks/artwork";
import { createOriginalListing } from "@/lib/artworks/original-listing";

describe("US-1.5 — Edit Listing", () => {
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
      title: "Original Title",
      description: "Original description.",
    });
    artworkId = artwork.id;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("seller can update title and description", async () => {
    const updated = await updateArtwork(artworkId, sellerId, {
      title: "Updated Title",
      description: "Updated description.",
    });

    expect(updated.title).toBe("Updated Title");
    expect(updated.description).toBe("Updated description.");
  });

  it("seller can update medium, dimensions, and year", async () => {
    const updated = await updateArtwork(artworkId, sellerId, {
      medium: "Watercolor",
      dimensions: "18x24 inches",
      year: 2023,
    });

    expect(updated.medium).toBe("Watercolor");
    expect(updated.dimensions).toBe("18x24 inches");
    expect(updated.year).toBe(2023);
  });

  it("non-owner cannot edit the artwork", async () => {
    const other = await prisma.user.create({
      data: {
        email: "other@example.com",
        passwordHash: "x",
        name: "Other Seller",
        roles: ["SELLER"],
      },
    });

    await expect(
      updateArtwork(artworkId, other.id, { title: "Hacked Title" })
    ).rejects.toThrow(/not authorized|forbidden/i);
  });

  it("edit is reflected immediately — updated fields are persisted", async () => {
    await updateArtwork(artworkId, sellerId, { title: "Persisted Title" });
    const fetched = await prisma.artwork.findUnique({ where: { id: artworkId } });
    expect(fetched?.title).toBe("Persisted Title");
  });

  it("updating a published artwork keeps it published", async () => {
    await publishArtwork(artworkId, sellerId);
    const updated = await updateArtwork(artworkId, sellerId, { title: "Still Published" });
    expect(updated.status).toBe("PUBLISHED");
  });
});
