import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: vi.fn() }));

const { deleteListingAction } = await import("@/app/actions/listings");
const { auth } = await import("@/auth");

describe("US-11.3 — Delete Unsold Listing", () => {
  let sellerId: string;
  let otherSellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller113@test.com", name: "Test Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;
    const other = await prisma.user.create({
      data: { email: "other113@test.com", name: "Other Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    otherSellerId = other.id;
    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  async function createListing(sellerId: string, status: "ACTIVE" | "ARCHIVED" | "SOLD" = "ACTIVE") {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Test Art", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://cdn.example.com/art.jpg", isPrimary: true, order: 0 },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, currency: "USD", status },
    });
    return { artwork, listing };
  }

  async function createAuctionListing(bidCount: number) {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Auction Art", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD", status: "ACTIVE" },
    });
    await prisma.auction.create({
      data: { originalListingId: listing.id, startBid: 50, bidCount, endAt: new Date(Date.now() + 3600000) },
    });
    return { artwork, listing };
  }

  it("deletes an ACTIVE listing and its artwork", async () => {
    const { listing, artwork } = await createListing(sellerId, "ACTIVE");
    const result = await deleteListingAction(listing.id);
    expect(result).toEqual({ success: true });
    expect(await prisma.originalListing.findUnique({ where: { id: listing.id } })).toBeNull();
    expect(await prisma.artwork.findUnique({ where: { id: artwork.id } })).toBeNull();
  });

  it("deletes an ARCHIVED listing", async () => {
    const { listing, artwork } = await createListing(sellerId, "ARCHIVED");
    const result = await deleteListingAction(listing.id);
    expect(result).toEqual({ success: true });
    expect(await prisma.originalListing.findUnique({ where: { id: listing.id } })).toBeNull();
    expect(await prisma.artwork.findUnique({ where: { id: artwork.id } })).toBeNull();
  });

  it("rejects deletion of a SOLD listing", async () => {
    const { listing } = await createListing(sellerId, "SOLD");
    const result = await deleteListingAction(listing.id);
    expect(result).toEqual({ error: "Cannot delete a sold listing." });
    expect(await prisma.originalListing.findUnique({ where: { id: listing.id } })).not.toBeNull();
  });

  it("rejects deletion of an auction with active bids", async () => {
    const { listing } = await createAuctionListing(2);
    const result = await deleteListingAction(listing.id);
    expect(result).toEqual({ error: "Cannot delete an auction with active bids." });
    expect(await prisma.originalListing.findUnique({ where: { id: listing.id } })).not.toBeNull();
  });

  it("removes artwork images from DB after deletion", async () => {
    const { listing, artwork } = await createListing(sellerId, "ACTIVE");
    await deleteListingAction(listing.id);
    expect(await prisma.artworkImage.findMany({ where: { artworkId: artwork.id } })).toHaveLength(0);
  });

  it("does not allow another seller to delete this listing", async () => {
    const { listing } = await createListing(otherSellerId, "ACTIVE");
    const result = await deleteListingAction(listing.id);
    expect(result).toEqual({ error: "Not found." });
    expect(await prisma.originalListing.findUnique({ where: { id: listing.id } })).not.toBeNull();
  });
});
