import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { placeBidAction } = await import("@/app/actions/auctions");
const { auth } = await import("@/auth");

describe("US-12.3 — Outbid Email Notification", () => {
  let sellerId: string;
  let buyer1Id: string;
  let buyer2Id: string;
  let auctionId: string;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await resetDatabase();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const seller = await prisma.user.create({
      data: { email: "seller123@test.com", name: "Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;
    const b1 = await prisma.user.create({
      data: { email: "buyer1@test.com", name: "Buyer 1", passwordHash: "hash", roles: ["BUYER"] },
    });
    buyer1Id = b1.id;
    const b2 = await prisma.user.create({
      data: { email: "buyer2@test.com", name: "Buyer 2", passwordHash: "hash", roles: ["BUYER"] },
    });
    buyer2Id = b2.id;

    const artwork = await prisma.artwork.create({
      data: { sellerId, title: "Auction Piece", description: "D", status: "PUBLISHED", publishedAt: new Date() },
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
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("sends outbid email to the displaced bidder", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyer1Id, roles: ["BUYER"] } } as never);
    await placeBidAction(auctionId, 150);

    vi.mocked(auth).mockResolvedValue({ user: { id: buyer2Id, roles: ["BUYER"] } } as never);
    await placeBidAction(auctionId, 200);

    // One fetch for buyer1 being outbid by buyer2
    const resendCalls = fetchSpy.mock.calls.filter(([url]: [unknown]) =>
      typeof url === "string" && url.includes("mailersend.com")
    );
    expect(resendCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(resendCalls[resendCalls.length - 1][1]?.body as string);
    expect(body.to[0].email).toBe("buyer1@test.com");
    expect(body.subject).toContain("outbid");
  });

  it("does NOT send an email on the first bid (no previous bidder)", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyer1Id, roles: ["BUYER"] } } as never);
    await placeBidAction(auctionId, 150);

    const resendCalls = fetchSpy.mock.calls.filter(([url]: [unknown]) =>
      typeof url === "string" && url.includes("mailersend.com")
    );
    expect(resendCalls.length).toBe(0);
  });

  it("does NOT send an email when a buyer outbids themselves", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyer1Id, roles: ["BUYER"] } } as never);
    await placeBidAction(auctionId, 150);
    await placeBidAction(auctionId, 200);

    const resendCalls = fetchSpy.mock.calls.filter(([url]: [unknown]) =>
      typeof url === "string" && url.includes("mailersend.com")
    );
    expect(resendCalls.length).toBe(0);
  });

  it("does NOT send an email when the outbid buyer has opted out", async () => {
    // buyer1 opts out of outbid emails
    await prisma.user.update({
      where: { id: buyer1Id },
      data: { loginMetadata: { notifications: { outbidEmails: false } } },
    });

    vi.mocked(auth).mockResolvedValue({ user: { id: buyer1Id, roles: ["BUYER"] } } as never);
    await placeBidAction(auctionId, 150);

    vi.mocked(auth).mockResolvedValue({ user: { id: buyer2Id, roles: ["BUYER"] } } as never);
    await placeBidAction(auctionId, 200);

    const resendCalls = fetchSpy.mock.calls.filter(([url]: [unknown]) =>
      typeof url === "string" && url.includes("mailersend.com")
    );
    expect(resendCalls.length).toBe(0);
  });
});
