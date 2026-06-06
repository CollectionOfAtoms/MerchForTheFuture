import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase } from "../helpers/db";
import { prisma } from "@/lib/db";

describe("US-8.1 — Create Print Listing", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  async function seedArtworkWithListing() {
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const artwork = await prisma.artwork.create({
      data: { title: "Test Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 500, currency: "USD" },
    });
    return { seller, artwork, listing };
  }

  const sampleProducts = [
    { sku: "GLOBAL-FAP-16X24", description: "Fine Art Print 16x24", size: "16x24", price: 75 },
    { sku: "GLOBAL-FAP-20X30", description: "Fine Art Print 20x30", size: "20x30", price: 95 },
  ];

  it("enables print availability with products and source image on OriginalListing", async () => {
    const { listing } = await seedArtworkWithListing();
    const updated = await prisma.originalListing.update({
      where: { id: listing.id },
      data: {
        availableForPrint: true,
        printSourceImageUrl: "https://cdn.example.com/artwork.jpg",
        printProducts: sampleProducts,
      },
    });
    expect(updated.availableForPrint).toBe(true);
    expect(updated.printSourceImageUrl).toBe("https://cdn.example.com/artwork.jpg");
    const products = updated.printProducts as typeof sampleProducts;
    expect(products.length).toBe(2);
  });

  it("stores all product SKUs, sizes, and prices", async () => {
    const { listing } = await seedArtworkWithListing();
    const updated = await prisma.originalListing.update({
      where: { id: listing.id },
      data: {
        availableForPrint: true,
        printSourceImageUrl: "https://cdn.example.com/art.jpg",
        printProducts: sampleProducts,
      },
    });
    const products = updated.printProducts as typeof sampleProducts;
    expect(products[0].sku).toBe("GLOBAL-FAP-16X24");
    expect(products[0].price).toBe(75);
    expect(products[1].size).toBe("20x30");
  });

  it("defaults availableForPrint to false on new listings", async () => {
    const { listing } = await seedArtworkWithListing();
    expect(listing.availableForPrint).toBe(false);
    expect(listing.printSourceImageUrl).toBeNull();
    expect(listing.printProducts).toBeNull();
  });

  it("disabling print sets availableForPrint to false but preserves product config", async () => {
    const { listing } = await seedArtworkWithListing();
    await prisma.originalListing.update({
      where: { id: listing.id },
      data: { availableForPrint: true, printSourceImageUrl: "https://cdn.example.com/art.jpg", printProducts: sampleProducts },
    });
    const disabled = await prisma.originalListing.update({
      where: { id: listing.id },
      data: { availableForPrint: false },
    });
    expect(disabled.availableForPrint).toBe(false);
    const products = disabled.printProducts as typeof sampleProducts;
    expect(products.length).toBe(2);
  });

  it("fetches available products from Prodigi catalog (MSW-intercepted)", async () => {
    const { getPrintCatalog } = await import("@/lib/print/listing");
    const products = await getPrintCatalog();
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].sku).toBeDefined();
  });
});
