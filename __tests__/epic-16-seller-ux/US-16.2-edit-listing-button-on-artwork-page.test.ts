import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { getArtworkDetail } from "@/lib/artworks/detail";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSeller(tag = "a") {
  return prisma.user.create({
    data: { email: `seller16b-${tag}@test.com`, name: "Test Seller", passwordHash: "x", roles: ["SELLER"] as never },
  });
}

async function createPublishedArtworkWithListing(sellerId: string) {
  const artwork = await prisma.artwork.create({
    data: {
      sellerId,
      title: "Golden Hour",
      description: "A painting.",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.artworkImage.create({
    data: { artworkId: artwork.id, url: "https://cdn.example.com/golden.jpg", isPrimary: true, order: 0 },
  });
  const listing = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 950, currency: "USD", status: "ACTIVE" },
  });
  return { artwork, listing };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-16.2 — Edit listing button on artwork page", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  it("getArtworkDetail returns sellerId for the artwork", async () => {
    const seller = await seedSeller();
    const { artwork } = await createPublishedArtworkWithListing(seller.id);

    const detail = await getArtworkDetail(artwork.id);

    expect(detail).not.toBeNull();
    expect(detail!.sellerId).toBe(seller.id);
  });

  it("edit URL can be formed from listingId returned in artwork detail", async () => {
    const seller = await seedSeller();
    const { artwork, listing } = await createPublishedArtworkWithListing(seller.id);

    const detail = await getArtworkDetail(artwork.id);

    expect(detail!.original).not.toBeNull();
    const editUrl = `/seller/listings/${detail!.original!.listingId}/edit`;
    expect(editUrl).toBe(`/seller/listings/${listing.id}/edit`);
  });

  it("sellerId matches the seller who created the artwork, not any other user", async () => {
    const sellerA = await seedSeller("a");
    const sellerB = await seedSeller("b");
    const { artwork } = await createPublishedArtworkWithListing(sellerA.id);

    const detail = await getArtworkDetail(artwork.id);

    expect(detail!.sellerId).toBe(sellerA.id);
    expect(detail!.sellerId).not.toBe(sellerB.id);
  });

  it("artwork with no listing still exposes sellerId", async () => {
    const seller = await seedSeller();
    const artwork = await prisma.artwork.create({
      data: {
        sellerId: seller.id,
        title: "Unlisted Work",
        description: "Not for sale.",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://cdn.example.com/art.jpg", isPrimary: true, order: 0 },
    });

    const detail = await getArtworkDetail(artwork.id);

    expect(detail!.sellerId).toBe(seller.id);
    expect(detail!.original).toBeNull();
  });
});
