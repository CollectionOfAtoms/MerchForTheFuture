import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { browseArtworks } from "@/lib/artworks/browse";

describe("US-7.3 — Search", () => {
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller73@test.com", name: "Gallery", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;
  });

  async function seedArtwork(opts: { title: string; description?: string; medium?: string; artist?: string; status?: "PUBLISHED" | "DRAFT" }) {
    const artwork = await prisma.artwork.create({
      data: {
        sellerId,
        title: opts.title,
        description: opts.description ?? "D",
        medium: opts.medium ?? null,
        artist: opts.artist ?? null,
        status: opts.status ?? "PUBLISHED",
        publishedAt: opts.status === "DRAFT" ? null : new Date(),
      },
    });
    if (opts.status !== "DRAFT") {
      await prisma.artworkImage.create({
        data: { artworkId: artwork.id, url: `https://cdn.example.com/${artwork.id}.jpg`, isPrimary: true, order: 0 },
      });
    }
    return artwork;
  }

  it("matches artworks by title keyword", async () => {
    await seedArtwork({ title: "Sunflower Fields", description: "A summer landscape" });
    await seedArtwork({ title: "Ocean Waves", description: "A seascape" });

    const result = await browseArtworks({ q: "sunflower" });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Sunflower Fields");
  });

  it("matches artworks by description keyword", async () => {
    await seedArtwork({ title: "Abstract 1", description: "A vibrant depiction of the aurora borealis" });
    await seedArtwork({ title: "Abstract 2", description: "A calm pastoral scene" });

    const result = await browseArtworks({ q: "aurora" });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Abstract 1");
  });

  it("matches artworks by medium", async () => {
    await seedArtwork({ title: "Work A", medium: "Watercolor on paper" });
    await seedArtwork({ title: "Work B", medium: "Oil on canvas" });

    const result = await browseArtworks({ q: "watercolor" });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Work A");
  });

  it("matches artworks by artist name", async () => {
    await seedArtwork({ title: "Voss Piece", artist: "Elena Voss" });
    await seedArtwork({ title: "Ricci Piece", artist: "Marco Ricci" });

    const result = await browseArtworks({ q: "ricci" });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Ricci Piece");
  });

  it("is case-insensitive", async () => {
    await seedArtwork({ title: "SOLAR WIND" });

    const result = await browseArtworks({ q: "solar wind" });
    expect(result.artworks).toHaveLength(1);
  });

  it("returns empty array when no results match", async () => {
    await seedArtwork({ title: "Some Art" });

    const result = await browseArtworks({ q: "xyznotfound" });
    expect(result.artworks).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("search can be combined with filters", async () => {
    await seedArtwork({ title: "Solar Panel Study", medium: "Oil on canvas" });
    await seedArtwork({ title: "Solar Flare", medium: "Watercolor" });

    const result = await browseArtworks({ q: "solar", filters: { medium: "oil" } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Solar Panel Study");
  });

  it("does not return unpublished artworks in search results", async () => {
    await seedArtwork({ title: "Secret Draft", description: "aurora borealis", status: "DRAFT" });

    const result = await browseArtworks({ q: "aurora" });
    expect(result.artworks).toHaveLength(0);
  });
});
