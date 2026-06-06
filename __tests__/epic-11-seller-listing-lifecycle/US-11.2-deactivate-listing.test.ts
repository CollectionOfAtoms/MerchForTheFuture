import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { toggleListingStatusAction } = await import("@/app/actions/listings");
const { auth } = await import("@/auth");

describe("US-11.2 — Deactivate / Reactivate Listing", () => {
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller112@test.com", name: "Test Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;
    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  async function createListing(status: "ACTIVE" | "ARCHIVED" | "SOLD" = "ACTIVE") {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Test Art", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    return prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, currency: "USD", status },
    });
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
    return listing;
  }

  it("toggles ACTIVE listing to ARCHIVED", async () => {
    const listing = await createListing("ACTIVE");
    await toggleListingStatusAction(listing.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("ARCHIVED");
  });

  it("toggles ARCHIVED listing back to ACTIVE", async () => {
    const listing = await createListing("ARCHIVED");
    await toggleListingStatusAction(listing.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("ACTIVE");
  });

  it("does not change SOLD listing status", async () => {
    const listing = await createListing("SOLD");
    await toggleListingStatusAction(listing.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("SOLD");
  });

  it("does not deactivate an auction that has active bids", async () => {
    const listing = await createAuctionListing(3);
    await toggleListingStatusAction(listing.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("ACTIVE");
  });

  it("allows deactivating an auction with zero bids", async () => {
    const listing = await createAuctionListing(0);
    await toggleListingStatusAction(listing.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("ARCHIVED");
  });
});
