import { describe, it, expect, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

const { getSellerListingSummary } = await import("@/lib/dashboard/seller");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: ["SELLER"] as never },
  });
}

async function seedArtwork(sellerId: string, status: "ACTIVE" | "ARCHIVED" | "SOLD") {
  const artwork = await prisma.artwork.create({
    data: { sellerId, title: "Art", artist: "A", description: "d", status: "PUBLISHED" },
  });
  await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status },
  });
}

async function seedDesignedApparel(sellerId: string, status: "ACTIVE" | "ARCHIVED" | "SOLD") {
  const pt = await prisma.productType.create({
    data: { name: `Tee ${crypto.randomUUID()}`, fulfillmentProvider: "PRODIGI", providerSkuBase: "RNA1" },
  });
  await prisma.apparelListing.create({
    data: { sellerId, sourcingMode: "DESIGNED", productTypeId: pt.id, title: "Bee", retailPrice: 28, status, designImageUrl: "https://blob/d.png" },
  });
}

async function seedReferencedApparel(sellerId: string, status: "ACTIVE" | "ARCHIVED" | "SOLD") {
  await prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      title: "Plants",
      retailPrice: 32,
      status,
      providerKey: "teemill",
      providerProductRef: `ref-${crypto.randomUUID()}`,
    },
  });
}

// ─── US-MFTF-6.3 — seller dashboard count summary includes apparel ─────────────

describe("getSellerListingSummary — apparel in totals", () => {
  afterEach(async () => { await resetDatabase(); });

  it("returns all zeros for a seller with no listings", async () => {
    const seller = await seedSeller();
    expect(await getSellerListingSummary(seller.id)).toEqual({ active: 0, unlisted: 0, sold: 0, archived: 0, total: 0 });
  });

  it("still counts artwork listings on their own", async () => {
    const seller = await seedSeller();
    await seedArtwork(seller.id, "ACTIVE");
    await seedArtwork(seller.id, "SOLD");
    expect(await getSellerListingSummary(seller.id)).toMatchObject({ active: 1, sold: 1, total: 2 });
  });

  it("counts designed apparel listings in the totals", async () => {
    const seller = await seedSeller();
    await seedDesignedApparel(seller.id, "ACTIVE");
    await seedDesignedApparel(seller.id, "ARCHIVED");
    expect(await getSellerListingSummary(seller.id)).toMatchObject({ active: 1, archived: 1, total: 2 });
  });

  it("counts referenced apparel listings in the totals", async () => {
    const seller = await seedSeller();
    await seedReferencedApparel(seller.id, "ACTIVE");
    expect(await getSellerListingSummary(seller.id)).toMatchObject({ active: 1, total: 1 });
  });

  it("combines artwork and apparel into one count summary", async () => {
    const seller = await seedSeller();
    await seedArtwork(seller.id, "ACTIVE");
    await seedArtwork(seller.id, "ARCHIVED");
    await seedDesignedApparel(seller.id, "ACTIVE");
    await seedReferencedApparel(seller.id, "SOLD");
    expect(await getSellerListingSummary(seller.id)).toEqual({ active: 2, unlisted: 0, sold: 1, archived: 1, total: 4 });
  });

  it("counts only the given seller's listings", async () => {
    const seller = await seedSeller();
    const other = await seedSeller();
    await seedDesignedApparel(seller.id, "ACTIVE");
    await seedReferencedApparel(other.id, "ACTIVE");
    await seedArtwork(other.id, "ACTIVE");
    expect(await getSellerListingSummary(seller.id)).toEqual({ active: 1, unlisted: 0, sold: 0, archived: 0, total: 1 });
  });
});
