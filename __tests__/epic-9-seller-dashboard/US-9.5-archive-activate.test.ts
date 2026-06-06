import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { browseArtworks } from "@/lib/artworks/browse";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: vi.fn() }));

const { toggleListingStatusAction } = await import("@/app/actions/listings");
const { auth } = await import("@/auth");

describe("US-9.5 — Archive / Activate Listing", () => {
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller95@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER", "BUYER"] },
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
      data: { sellerId, title: "Gallery Piece", description: "D", status: "PUBLISHED" },
    });
    // browseArtworks requires { images: { some: {} } }
    await prisma.artworkImage.create({
      data: { artworkId: artwork.id, url: "https://example.com/img.jpg", isPrimary: true, order: 0 },
    });
    return prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 400, currency: "USD", status },
    });
  }

  async function createAuctionListing(bidCount: number) {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Auction Piece", description: "D", status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", price: 100, currency: "USD", status: "ACTIVE" },
    });
    await prisma.auction.create({
      data: { originalListingId: listing.id, startBid: 100, bidCount, endAt: new Date(Date.now() + 86400000) },
    });
    return listing;
  }

  // ── Toggle behaviour ─────────────────────────────────────────────────────────

  it("archives an ACTIVE listing", async () => {
    const listing = await createListing("ACTIVE");
    await toggleListingStatusAction(listing.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("ARCHIVED");
  });

  it("reactivates an ARCHIVED listing", async () => {
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

  it("does not archive auction with active bids", async () => {
    const listing = await createAuctionListing(1);
    await toggleListingStatusAction(listing.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("ACTIVE");
  });

  it("allows archiving an auction with zero bids", async () => {
    const listing = await createAuctionListing(0);
    await toggleListingStatusAction(listing.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("ARCHIVED");
  });

  it("ignores toggle request from a different seller", async () => {
    const other = await prisma.user.create({
      data: { email: "intruder@test.com", passwordHash: "x", roles: ["SELLER", "BUYER"] },
    });
    vi.mocked(auth).mockResolvedValue({ user: { id: other.id, roles: ["SELLER"] } } as never);

    const listing = await createListing("ACTIVE");
    await toggleListingStatusAction(listing.id);
    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(updated!.status).toBe("ACTIVE");
  });

  // ── Browse visibility ────────────────────────────────────────────────────────

  it("ARCHIVED listing does not appear in browse results", async () => {
    await createListing("ARCHIVED");
    const results = await browseArtworks({});
    expect(results.artworks).toHaveLength(0);
  });

  it("ACTIVE listing appears in browse results", async () => {
    await createListing("ACTIVE");
    const results = await browseArtworks({});
    expect(results.artworks).toHaveLength(1);
  });

  it("archiving an active listing removes it from browse results", async () => {
    const listing = await createListing("ACTIVE");

    const before = await browseArtworks({});
    expect(before.artworks).toHaveLength(1);

    await toggleListingStatusAction(listing.id);

    const after = await browseArtworks({});
    expect(after.artworks).toHaveLength(0);
  });

  it("reactivating an archived listing restores it to browse results", async () => {
    const listing = await createListing("ARCHIVED");

    const before = await browseArtworks({});
    expect(before.artworks).toHaveLength(0);

    await toggleListingStatusAction(listing.id);

    const after = await browseArtworks({});
    expect(after.artworks).toHaveLength(1);
  });
});
