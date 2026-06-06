import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { createArtwork, publishArtwork } from "@/lib/artworks/artwork";

describe("US-1.1 — Create Listing", () => {
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

  it("creates a new artwork listing as a draft", async () => {
    const artwork = await createArtwork({
      sellerId,
      title: "Solar Flare",
      description: "A painting of the sun.",
    });

    expect(artwork.id).toBeDefined();
    expect(artwork.status).toBe("DRAFT");
    expect(artwork.title).toBe("Solar Flare");
  });

  it("draft artwork is not visible in published listings", async () => {
    await createArtwork({ sellerId, title: "Draft Only", description: "Not published." });

    const published = await prisma.artwork.findMany({ where: { status: "PUBLISHED" } });
    expect(published).toHaveLength(0);
  });

  it("published artwork has a unique id usable as a URL slug", async () => {
    const artwork = await createArtwork({
      sellerId,
      title: "Wind Turbine",
      description: "Clean energy art.",
    });
    const published = await publishArtwork(artwork.id, sellerId);

    expect(published.id).toBeDefined();
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).not.toBeNull();
  });

  it("only the seller who created the artwork can publish it", async () => {
    const other = await prisma.user.create({
      data: {
        email: "other@example.com",
        passwordHash: "x",
        name: "Other",
        roles: ["SELLER"],
      },
    });
    const artwork = await createArtwork({ sellerId, title: "Mine", description: "Mine." });

    await expect(publishArtwork(artwork.id, other.id)).rejects.toThrow(/not authorized|forbidden/i);
  });

  it("rejects creation with missing title", async () => {
    await expect(
      createArtwork({ sellerId, title: "", description: "No title." })
    ).rejects.toThrow(/title/i);
  });

  it("rejects creation with missing description", async () => {
    await expect(
      createArtwork({ sellerId, title: "Something", description: "" })
    ).rejects.toThrow(/description/i);
  });
});
