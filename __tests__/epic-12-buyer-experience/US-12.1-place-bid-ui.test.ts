import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/payments/email", () => ({ sendOutbidEmail: vi.fn() }));

const { placeBidAction } = await import("@/app/actions/auctions");
const { auth } = await import("@/auth");

describe("US-12.1 — Place Bid on Auction (UI Flow)", () => {
  let buyerId: string;
  let auctionId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller121@test.com", name: "Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer121@test.com", name: "Buyer", passwordHash: "hash", roles: ["BUYER"] },
    });
    buyerId = buyer.id;
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);

    const artwork = await prisma.artwork.create({
      data: { sellerId: seller.id, title: "Auction Art", description: "D", status: "PUBLISHED", publishedAt: new Date() },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD", status: "ACTIVE" },
    });
    const auction = await prisma.auction.create({
      data: { originalListingId: listing.id, startBid: 100, endAt: new Date(Date.now() + 3600000), status: "ACTIVE" },
    });
    auctionId = auction.id;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  it("valid bid above start bid returns success", async () => {
    const result = await placeBidAction(auctionId, 150);
    expect(result).toEqual({ success: true, newBid: 150 });
  });

  it("updates auction currentBid in DB after success", async () => {
    await placeBidAction(auctionId, 200);
    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    expect(Number(auction!.currentBid)).toBe(200);
  });

  it("bid below start bid returns error", async () => {
    const result = await placeBidAction(auctionId, 50);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/start bid|minimum/i);
  });

  it("bid at or below current high returns error", async () => {
    await placeBidAction(auctionId, 150);
    const result = await placeBidAction(auctionId, 150);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/exceed|higher/i);
  });

  it("unauthenticated user is redirected to sign-in", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(placeBidAction(auctionId, 150)).rejects.toThrow("NEXT_REDIRECT:/sign-in");
  });
});
