import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { browseArtworks } from "@/lib/artworks/browse";

describe("US-15.3 — Prints Page (Filtered Browse)", () => {
  let sellerId: string;

  const printConfig = {
    availableForPrint: true,
    printSourceImageUrl: "https://cdn.example.com/source.jpg",
    printProducts: [
      { sku: "GLOBAL-FAP-16x12", size: "16x12", price: 45 },
      { sku: "GLOBAL-FAP-20x16", size: "20x16", price: 65 },
    ],
  };

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller153@test.com", name: "Print Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;
  });

  async function seedArtworkWithListing(
    title: string,
    opts: { availableForPrint?: boolean; originalStatus?: "ACTIVE" | "SOLD" | "ARCHIVED"; printProducts?: unknown[] } = {}
  ) {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title, description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: `https://cdn.example.com/${artwork.id}.jpg`, isPrimary: true, order: 0 },
    });
    await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: 500,
        currency: "USD",
        status: opts.originalStatus ?? "ACTIVE",
        availableForPrint: opts.availableForPrint ?? false,
        ...(opts.availableForPrint
          ? {
              printSourceImageUrl: printConfig.printSourceImageUrl,
              printProducts: (opts.printProducts ?? printConfig.printProducts) as never,
            }
          : {}),
      },
    });
    return artwork;
  }

  it("returns only artworks with availableForPrint: true", async () => {
    await seedArtworkWithListing("Print Available", { availableForPrint: true });
    await seedArtworkWithListing("Original Only");

    const result = await browseArtworks({ filters: { availability: "print" } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].title).toBe("Print Available");
  });

  it("excludes artworks where availableForPrint is false", async () => {
    await seedArtworkWithListing("No Print");

    const result = await browseArtworks({ filters: { availability: "print" } });
    expect(result.artworks).toHaveLength(0);
  });

  it("includes sold original listings when availableForPrint is true", async () => {
    await seedArtworkWithListing("Sold With Print", { availableForPrint: true, originalStatus: "SOLD" });

    const result = await browseArtworks({ filters: { availability: "print" } });
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].originalStatus).toBe("SOLD");
    expect(result.artworks[0].hasPrint).toBe(true);
  });

  it("hasPrint flag is true for print-enabled artworks in results", async () => {
    await seedArtworkWithListing("Has Print", { availableForPrint: true });

    const result = await browseArtworks({ filters: { availability: "print" } });
    expect(result.artworks[0].hasPrint).toBe(true);
  });

  it("general browse includes print-enabled artworks alongside originals", async () => {
    await seedArtworkWithListing("Active Original");
    await seedArtworkWithListing("Print Available", { availableForPrint: true });

    const result = await browseArtworks({});
    expect(result.artworks).toHaveLength(2);
  });

  it("stores minimum product price accessible on the listing for badge rendering", async () => {
    await seedArtworkWithListing("Multi Price", {
      availableForPrint: true,
      printProducts: [
        { sku: "GLOBAL-FAP-16x12", size: "16x12", price: 45 },
        { sku: "GLOBAL-FAP-20x16", size: "20x16", price: 65 },
      ],
    });

    const listing = await prisma.originalListing.findFirst({ where: { artwork: { title: "Multi Price" } } });
    const storedProducts = listing!.printProducts as Array<{ price: number }>;
    const minPrice = Math.min(...storedProducts.map((p) => p.price));
    expect(minPrice).toBe(45);
  });

  it("supports pagination for print results", async () => {
    for (let i = 0; i < 5; i++) {
      await seedArtworkWithListing(`Print ${i}`, { availableForPrint: true });
    }

    const page1 = await browseArtworks({ filters: { availability: "print" }, page: 1, limit: 3 });
    expect(page1.artworks).toHaveLength(3);
    expect(page1.total).toBe(5);
    expect(page1.totalPages).toBe(2);

    const page2 = await browseArtworks({ filters: { availability: "print" }, page: 2, limit: 3 });
    expect(page2.artworks).toHaveLength(2);
  });
});
