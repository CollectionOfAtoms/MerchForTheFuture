import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { createArtwork } from "@/lib/artworks/artwork";
import {
  addImageToArtwork,
  getImagesForArtwork,
  validateImageFormat,
} from "@/lib/artworks/images";

describe("US-1.2 — Upload Images", () => {
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
      title: "Solar Panel Field",
      description: "A field of solar panels.",
    });
    artworkId = artwork.id;
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  describe("Unit: image format validation", () => {
    it("accepts JPEG files", () => {
      expect(validateImageFormat("image/jpeg")).toBe(true);
    });

    it("accepts PNG files", () => {
      expect(validateImageFormat("image/png")).toBe(true);
    });

    it("accepts WebP files", () => {
      expect(validateImageFormat("image/webp")).toBe(true);
    });

    it("rejects GIF files", () => {
      expect(validateImageFormat("image/gif")).toBe(false);
    });

    it("rejects PDF files", () => {
      expect(validateImageFormat("application/pdf")).toBe(false);
    });
  });

  describe("Integration: image persistence", () => {
    it("adds an image to an artwork", async () => {
      const image = await addImageToArtwork({
        artworkId,
        url: "https://cdn.example.com/image1.jpg",
        isPrimary: true,
        order: 0,
      });

      expect(image.id).toBeDefined();
      expect(image.artworkId).toBe(artworkId);
      expect(image.isPrimary).toBe(true);
    });

    it("supports multiple images per artwork", async () => {
      await addImageToArtwork({ artworkId, url: "https://cdn.example.com/img1.jpg", isPrimary: true, order: 0 });
      await addImageToArtwork({ artworkId, url: "https://cdn.example.com/img2.jpg", isPrimary: false, order: 1 });
      await addImageToArtwork({ artworkId, url: "https://cdn.example.com/img3.jpg", isPrimary: false, order: 2 });

      const images = await getImagesForArtwork(artworkId);
      expect(images).toHaveLength(3);
    });

    it("returns images ordered by the order field", async () => {
      await addImageToArtwork({ artworkId, url: "https://cdn.example.com/c.jpg", isPrimary: false, order: 2 });
      await addImageToArtwork({ artworkId, url: "https://cdn.example.com/a.jpg", isPrimary: true, order: 0 });
      await addImageToArtwork({ artworkId, url: "https://cdn.example.com/b.jpg", isPrimary: false, order: 1 });

      const images = await getImagesForArtwork(artworkId);
      expect(images[0].url).toContain("a.jpg");
      expect(images[1].url).toContain("b.jpg");
      expect(images[2].url).toContain("c.jpg");
    });

    it("rejects an empty URL", async () => {
      await expect(
        addImageToArtwork({ artworkId, url: "", isPrimary: true, order: 0 })
      ).rejects.toThrow(/url/i);
    });
  });
});
