import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: vi.fn() }));

const { updateListingAction } = await import("@/app/actions/listings");
const { auth } = await import("@/auth");

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("US-9.4 — Edit Listing Details", () => {
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller94@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER", "BUYER"] },
    });
    sellerId = seller.id;
    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  async function createFixedListing(title = "Original Title", status: "ACTIVE" | "SOLD" | "ARCHIVED" = "ACTIVE") {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title, description: "Original desc", status: "PUBLISHED", artist: "Old Artist", medium: "Oil" },
    });
    return prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 300, currency: "USD", status },
    });
  }

  async function createAuctionListing(bidCount = 0) {
    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Auction Art", description: "D", status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", price: 100, currency: "USD", status: "ACTIVE" },
    });
    await prisma.auction.create({
      data: { originalListingId: listing.id, startBid: 100, reservePrice: 200, bidCount, endAt: new Date(Date.now() + 86400000) },
    });
    return listing;
  }

  it("updates artwork title and description", async () => {
    const listing = await createFixedListing();
    const fd = makeFormData({ title: "New Title", description: "New desc", price: "300", artist: "Old Artist", medium: "Oil", dimensionW: "10", dimensionH: "12", dimensionUnit: "in" });
    const result = await updateListingAction(listing.id, undefined, fd);
    expect(result).toEqual({ success: true });

    const artwork = await prisma.artwork.findUnique({ where: { id: listing.artworkId } });
    expect(artwork!.title).toBe("New Title");
    expect(artwork!.description).toBe("New desc");
  });

  it("updates fixed-price listing price", async () => {
    const listing = await createFixedListing();
    const fd = makeFormData({ title: "Title", description: "Desc", price: "999", dimensionW: "10", dimensionH: "12", dimensionUnit: "in" });
    await updateListingAction(listing.id, undefined, fd);

    const updated = await prisma.originalListing.findUnique({ where: { id: listing.id } });
    expect(Number(updated!.price)).toBe(999);
  });

  it("rejects price of zero on fixed-price listing", async () => {
    const listing = await createFixedListing();
    const fd = makeFormData({ title: "Title", description: "Desc", price: "0", dimensionW: "10", dimensionH: "12", dimensionUnit: "in" });
    const result = await updateListingAction(listing.id, undefined, fd);
    expect(result).toEqual({ error: "Price must be greater than zero." });
  });

  it("updates artist, medium, and dimensions", async () => {
    const listing = await createFixedListing();
    const fd = makeFormData({ title: "T", description: "D", price: "300", artist: "New Artist", medium: "Acrylic", dimensionW: "18", dimensionH: "24", dimensionUnit: "in" });
    await updateListingAction(listing.id, undefined, fd);

    const artwork = await prisma.artwork.findUnique({ where: { id: listing.artworkId } });
    expect(artwork!.artist).toBe("New Artist");
    expect(artwork!.medium).toBe("Acrylic");
    expect(artwork!.dimensions).toBe("18×24 in");
  });

  it("rejects edit from a different seller", async () => {
    const other = await prisma.user.create({
      data: { email: "other@test.com", passwordHash: "x", roles: ["SELLER", "BUYER"] },
    });
    vi.mocked(auth).mockResolvedValue({ user: { id: other.id, roles: ["SELLER"] } } as never);

    const listing = await createFixedListing();
    const fd = makeFormData({ title: "Hijacked", description: "D", price: "100", dimensionW: "10", dimensionH: "10", dimensionUnit: "in" });
    const result = await updateListingAction(listing.id, undefined, fd);
    expect(result).toEqual({ error: "Listing not found." });
  });

  it("rejects missing title on update", async () => {
    const listing = await createFixedListing();
    const fd = makeFormData({ title: "", description: "D", price: "300", dimensionW: "10", dimensionH: "12", dimensionUnit: "in" });
    const result = await updateListingAction(listing.id, undefined, fd);
    expect(result).toEqual({ error: "Title is required." });
  });

  it("can update auction reserve price before any bids", async () => {
    const listing = await createAuctionListing(0);
    const fd = makeFormData({ title: "Auction Art", description: "D", reservePrice: "350", dimensionW: "10", dimensionH: "12", dimensionUnit: "in" });
    const result = await updateListingAction(listing.id, undefined, fd);
    expect(result).toEqual({ success: true });

    const auction = await prisma.auction.findFirst({ where: { originalListingId: listing.id } });
    expect(Number(auction!.reservePrice)).toBe(350);
  });

  it("still allows metadata edits on auction listing with bids (reserve price update)", async () => {
    // The action allows updating auction reserve price regardless of bid count;
    // the UI disables the reserve field when bids > 0, but the action doesn't enforce it.
    // This test confirms the action itself doesn't block on bid count for title/description.
    const listing = await createAuctionListing(2);
    const fd = makeFormData({ title: "Updated Title", description: "Updated desc", dimensionW: "10", dimensionH: "12", dimensionUnit: "in" });
    const result = await updateListingAction(listing.id, undefined, fd);
    expect(result).toEqual({ success: true });

    const artwork = await prisma.artwork.findUnique({ where: { id: listing.artworkId } });
    expect(artwork!.title).toBe("Updated Title");
  });
});
