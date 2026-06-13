import { describe, it, expect, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

const { getSellerListings } = await import("@/lib/seller/listings");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: ["SELLER"] as never },
  });
}

async function seedArtworkListing(
  sellerId: string,
  { createdAt, withBids = false, thumbnailUrl = "https://img/art-thumb.jpg" }: { createdAt?: Date; withBids?: boolean; thumbnailUrl?: string | null } = {},
) {
  const artwork = await prisma.artwork.create({
    data: { sellerId, title: "Coastal Horizon", artist: "A", description: "d", status: "PUBLISHED" },
  });
  await prisma.artworkImage.create({
    data: { artworkId: artwork.id, url: "https://img/art.jpg", thumbnailUrl, isPrimary: true, order: 0 },
  });
  const listing = await prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: withBids ? "AUCTION" : "FIXED_PRICE",
      price: 120,
      status: "ACTIVE",
      ...(createdAt ? { createdAt } : {}),
    },
  });
  if (withBids) {
    await prisma.auction.create({
      data: { originalListingId: listing.id, startBid: 100, bidCount: 3, endAt: new Date(Date.now() + 86_400_000), status: "ACTIVE" },
    });
  }
  return { artwork, listing };
}

async function seedApparelListing(
  sellerId: string,
  { createdAt, status = "ACTIVE", primaryThumb = "https://img/ls-thumb.jpg" }: { createdAt?: Date; status?: "ACTIVE" | "ARCHIVED" | "SOLD"; primaryThumb?: string | null } = {},
) {
  const pt = await prisma.productType.create({
    data: { name: `Unisex Tee ${crypto.randomUUID()}`, fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
  });
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId,
      productTypeId: pt.id,
      title: "Solar Punk Bee",
      retailPrice: 28,
      status,
      designImageUrl: "https://blob/design.png",
      ...(createdAt ? { createdAt } : {}),
      images: {
        create: [{ originalUrl: "https://img/ls.jpg", thumbnailUrl: primaryThumb, isPrimary: true, sortOrder: 0 }],
      },
    },
  });
  return { pt, listing };
}

// ─── US-MFTF-6.3 (partial) — unified seller listings index ─────────────────────

describe("getSellerListings — unified seller listings index", () => {
  afterEach(async () => { await resetDatabase(); });

  it("returns an empty array when the seller has no listings", async () => {
    const seller = await seedSeller();
    expect(await getSellerListings(seller.id)).toEqual([]);
  });

  it("includes artwork listings tagged kind 'ARTWORK'", async () => {
    const seller = await seedSeller();
    await seedArtworkListing(seller.id);
    const rows = await getSellerListings(seller.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "ARTWORK",
      title: "Coastal Horizon",
      status: "ACTIVE",
      saleType: "FIXED_PRICE",
      price: 120,
      thumbnailUrl: "https://img/art-thumb.jpg",
    });
  });

  it("includes apparel listings tagged kind 'APPAREL' with product type and price", async () => {
    const seller = await seedSeller();
    await seedApparelListing(seller.id);
    const rows = await getSellerListings(seller.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "APPAREL",
      title: "Solar Punk Bee",
      status: "ACTIVE",
      productTypeName: expect.stringContaining("Unisex Tee"),
      retailPrice: 28,
      thumbnailUrl: "https://img/ls-thumb.jpg",
    });
  });

  it("merges artwork and apparel listings, newest first", async () => {
    const seller = await seedSeller();
    await seedArtworkListing(seller.id, { createdAt: new Date("2026-06-01T00:00:00Z") });
    await seedApparelListing(seller.id, { createdAt: new Date("2026-06-10T00:00:00Z") });
    const rows = await getSellerListings(seller.id);
    expect(rows.map((r) => r.kind)).toEqual(["APPAREL", "ARTWORK"]);
  });

  it("returns only the given seller's listings", async () => {
    const seller = await seedSeller();
    const other = await seedSeller();
    await seedApparelListing(seller.id);
    await seedArtworkListing(other.id);
    const rows = await getSellerListings(seller.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("APPAREL");
  });

  it("exposes auction bid state and the public artwork id for artwork rows", async () => {
    const seller = await seedSeller();
    const { artwork } = await seedArtworkListing(seller.id, { withBids: true });
    const [row] = await getSellerListings(seller.id);
    expect(row).toMatchObject({ kind: "ARTWORK", saleType: "AUCTION", hasBids: true, artworkId: artwork.id });
  });

  it("falls back through thumbnail → grid → original for apparel thumbnails", async () => {
    const seller = await seedSeller();
    await seedApparelListing(seller.id, { primaryThumb: null });
    const [row] = await getSellerListings(seller.id);
    // thumbnailUrl was null, so it should fall back to the gridUrl/originalUrl chain.
    expect(row.thumbnailUrl).toBe("https://img/ls.jpg");
  });
});
