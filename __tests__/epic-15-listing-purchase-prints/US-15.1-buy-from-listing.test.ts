import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/payments/email", () => ({
  sendPurchaseConfirmation: vi.fn().mockResolvedValue(undefined),
  // runFulfillment notifies the seller on an ORIGINAL sale (US-MFTF-15.4).
  sendSellerSaleNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/payments/stripe", () => ({ stripe: {} }));

const { initiateBuyNowAction } = await import("@/app/actions/checkout");
const { auth } = await import("@/auth");

describe("US-15.1 — Buy from Listing Page (Fixed-Price)", () => {
  let sellerId: string;
  let buyerId: string;
  let listingId: string;
  let artworkId: string;

  beforeEach(async () => {
    await resetDatabase();

    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    sellerId = seller.id;

    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", name: "Buyer", passwordHash: "x", roles: ["BUYER"] },
    });
    buyerId = buyer.id;

    const artwork = await prisma.artwork.create({
      data: {
        title: "Solar Flare",
        description: "A vibrant piece",
        sellerId,
        status: "PUBLISHED",
        images: { create: [{ url: "https://example.com/img.jpg", isPrimary: true, order: 0 }] },
      },
    });
    artworkId = artwork.id;

    const listing = await prisma.originalListing.create({
      data: { artworkId, saleType: "FIXED_PRICE", price: 1200, currency: "USD", status: "ACTIVE" },
    });
    listingId = listing.id;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("redirects unauthenticated users to sign-in", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(initiateBuyNowAction(listingId)).rejects.toThrow("NEXT_REDIRECT:/sign-in");
  });

  it("returns error for a SOLD listing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);
    await prisma.originalListing.update({ where: { id: listingId }, data: { status: "SOLD" } });

    const result = await initiateBuyNowAction(listingId);
    expect(result).toHaveProperty("error");
  });

  it("returns error for an ARCHIVED listing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);
    await prisma.originalListing.update({ where: { id: listingId }, data: { status: "ARCHIVED" } });

    const result = await initiateBuyNowAction(listingId);
    expect(result).toHaveProperty("error");
  });

  it("returns error if listing is an auction, not fixed-price", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);
    const auctionArtwork = await prisma.artwork.create({
      data: { title: "Auction Art", description: "D", sellerId, status: "PUBLISHED" },
    });
    const auctionListing = await prisma.originalListing.create({
      data: { artworkId: auctionArtwork.id, saleType: "AUCTION", price: 500, currency: "USD", status: "ACTIVE" },
    });

    const result = await initiateBuyNowAction(auctionListing.id);
    expect(result).toHaveProperty("error");
  });

  it("returns error if the seller tries to buy their own listing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);

    const result = await initiateBuyNowAction(listingId);
    expect(result).toHaveProperty("error");
  });

  it("creates a PENDING order and redirects to checkout", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);

    await expect(initiateBuyNowAction(listingId)).rejects.toThrow(/NEXT_REDIRECT:\/checkout\//);

    const order = await prisma.order.findFirst({ where: { buyerId, originalListingId: listingId } });
    expect(order).not.toBeNull();
    expect(order!.status).toBe("PENDING");
    expect(order!.listingType).toBe("ORIGINAL");
    expect(Number(order!.totalAmount)).toBe(1200);
  });

  it("redirect URL includes the new order ID", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);

    let redirectUrl = "";
    try {
      await initiateBuyNowAction(listingId);
    } catch (e: unknown) {
      redirectUrl = (e as Error).message.replace("NEXT_REDIRECT:", "");
    }

    const order = await prisma.order.findFirst({ where: { buyerId, originalListingId: listingId } });
    expect(redirectUrl).toContain(order!.id);
  });

  it("does not create a duplicate order if one already exists for this buyer+listing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);

    // Create an existing PENDING order
    await prisma.order.create({
      data: {
        buyerId,
        listingType: "ORIGINAL",
        originalListingId: listingId,
        subtotal: 1200,
        totalAmount: 1200,
        currency: "USD",
        status: "PENDING",
      },
    });

    try { await initiateBuyNowAction(listingId); } catch { /* redirect */ }

    const orders = await prisma.order.findMany({ where: { buyerId, originalListingId: listingId } });
    expect(orders).toHaveLength(1);
  });

  it("marks listing as SOLD and order as PAID when payment succeeds via webhook", async () => {
    const { fulfillPayment } = await import("@/lib/payments/webhook");

    const order = await prisma.order.create({
      data: {
        buyerId,
        listingType: "ORIGINAL",
        originalListingId: listingId,
        subtotal: 1200,
        totalAmount: 1200,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: "pi_test_123",
      },
    });

    await fulfillPayment("pi_test_123");

    const [updatedOrder, updatedListing] = await Promise.all([
      prisma.order.findUnique({ where: { id: order.id } }),
      prisma.originalListing.findUnique({ where: { id: listingId } }),
    ]);

    expect(updatedOrder!.status).toBe("PAID");
    expect(updatedListing!.status).toBe("SOLD");
  });
});
