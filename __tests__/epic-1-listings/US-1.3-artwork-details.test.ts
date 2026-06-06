import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { createArtwork, getArtworkById } from "@/lib/artworks/artwork";

describe("US-1.3 — Add Artwork Details", () => {
  let sellerId: string;

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
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("stores all artwork detail fields", async () => {
    const artwork = await createArtwork({
      sellerId,
      title: "Wind Energy",
      description: "A painting about wind energy.",
      medium: "Oil on canvas",
      dimensions: "24x36 inches",
      year: 2024,
    });

    const fetched = await getArtworkById(artwork.id);
    expect(fetched?.title).toBe("Wind Energy");
    expect(fetched?.description).toBe("A painting about wind energy.");
    expect(fetched?.medium).toBe("Oil on canvas");
    expect(fetched?.dimensions).toBe("24x36 inches");
    expect(fetched?.year).toBe(2024);
  });

  it("medium, dimensions, and year are optional", async () => {
    const artwork = await createArtwork({
      sellerId,
      title: "Minimal",
      description: "Just the required fields.",
    });

    const fetched = await getArtworkById(artwork.id);
    expect(fetched?.medium).toBeNull();
    expect(fetched?.dimensions).toBeNull();
    expect(fetched?.year).toBeNull();
  });

  it("returns null for a non-existent artwork id", async () => {
    const result = await getArtworkById("nonexistent-id");
    expect(result).toBeNull();
  });

  it("stores seller relationship correctly", async () => {
    const artwork = await createArtwork({
      sellerId,
      title: "Seller Link Test",
      description: "Testing seller association.",
    });

    const fetched = await getArtworkById(artwork.id);
    expect(fetched?.sellerId).toBe(sellerId);
  });
});
