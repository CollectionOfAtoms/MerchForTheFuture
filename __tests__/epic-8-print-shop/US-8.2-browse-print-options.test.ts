import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";
import { getArtworkDetail } from "@/lib/artworks/detail";

describe("US-8.2 — Browse Print Options", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedListingWithPrint() {
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "", sellerId: seller.id, status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://cdn.example.com/art.jpg", isPrimary: true, order: 0 },
    });
    const listing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: 500,
        currency: "USD",
        availableForPrint: true,
        printSourceImageUrl: "https://cdn.example.com/art.jpg",
        printProducts: [
          { sku: "GLOBAL-FAP-16X24", description: "Fine Art Print 16x24", size: "16x24", price: 75 },
          { sku: "GLOBAL-FAP-20X30", description: "Fine Art Print 20x30", size: "20x30", price: 95 },
        ],
      },
    });
    return { seller, artwork, listing };
  }

  it("returns print config with all product options for an artwork", async () => {
    const { artwork } = await seedListingWithPrint();
    const result = await getArtworkDetail(artwork.id);
    expect(result).not.toBeNull();
    expect(result!.original!.availableForPrint).toBe(true);
    const products = result!.original!.printProducts as Array<{ sku: string; size: string; price: number }>;
    expect(products.length).toBe(2);
  });

  it("returns availableForPrint: false when no print config is set", async () => {
    const seller = await prisma.user.create({
      data: { email: "nosell@test.com", name: "Seller2", passwordHash: "x", roles: ["SELLER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "No Print", description: "", sellerId: seller.id, status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://cdn.example.com/art.jpg", isPrimary: true, order: 0 },
    });
    await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 300, currency: "USD" },
    });
    const result = await getArtworkDetail(artwork.id);
    expect(result!.original!.availableForPrint).toBe(false);
    expect(result!.original!.printProducts).toBeNull();
  });

  it("returns product pricing for each size option", async () => {
    const { artwork } = await seedListingWithPrint();
    const result = await getArtworkDetail(artwork.id);
    const products = result!.original!.printProducts as Array<{ sku: string; size: string; price: number }>;
    const sizes = products.map((p) => p.size);
    expect(sizes).toContain("16x24");
    expect(sizes).toContain("20x30");
    const prices = products.map((p) => p.price);
    expect(prices).toContain(75);
    expect(prices).toContain(95);
  });
});
