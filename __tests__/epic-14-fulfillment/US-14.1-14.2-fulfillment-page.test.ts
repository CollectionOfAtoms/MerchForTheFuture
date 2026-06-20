import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/payments/email", () => ({
  sendShippingNotificationEmail: vi.fn().mockResolvedValue(undefined),
  sendAuctionWonEmail: vi.fn().mockResolvedValue(undefined),
  sendAuctionLostEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentReminderEmail: vi.fn().mockResolvedValue(undefined),
  sendPurchaseConfirmation: vi.fn().mockResolvedValue(undefined),
  sendOutbidEmail: vi.fn().mockResolvedValue(undefined),
  // actions/fulfillment now reaches the US-MFTF-14.2 transition seam, which imports
  // the lifecycle emails (US-MFTF-15.1 routes originals through it).
  sendShipmentPrintingEmail: vi.fn().mockResolvedValue(undefined),
  sendShipmentShippedEmail: vi.fn().mockResolvedValue(undefined),
  sendShipmentDeliveredEmail: vi.fn().mockResolvedValue(undefined),
}));

const { confirmShippingAction } = await import("@/app/actions/fulfillment");
const { auth } = await import("@/auth");

describe("US-14.1/14.2 — Fulfillment Page & Shipping Confirmation", () => {
  let buyerId: string;
  let orderId: string;

  beforeEach(async () => {
    await resetDatabase();

    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", name: "Buyer", passwordHash: "x", roles: ["BUYER"] },
    });
    buyerId = buyer.id;

    const artwork = await prisma.artwork.create({
      data: { title: "Test Art", description: "D", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD", status: "ACTIVE" },
    });
    const order = await prisma.order.create({
      data: {
        buyerId,
        listingType: "ORIGINAL",
        originalListingId: listing.id,
        subtotal: 500,
        totalAmount: 500,
        status: "PENDING",
        paymentDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });
    orderId = order.id;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("saves shipping address to the order", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);

    const fd = new FormData();
    fd.set("name", "Jane Doe");
    fd.set("line1", "123 Main St");
    fd.set("city", "Portland");
    fd.set("postal", "97201");
    fd.set("country", "US");

    const result = await confirmShippingAction(orderId, fd);
    expect(result).toEqual({ success: true });

    const updated = await prisma.order.findUnique({ where: { id: orderId } });
    expect(updated!.shippingName).toBe("Jane Doe");
    expect(updated!.shippingLine1).toBe("123 Main St");
    expect(updated!.shippingCity).toBe("Portland");
  });

  it("saves address to user account when saveAddress is checked", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);

    const fd = new FormData();
    fd.set("name", "Jane Doe");
    fd.set("line1", "123 Main St");
    fd.set("city", "Portland");
    fd.set("postal", "97201");
    fd.set("country", "US");
    fd.set("saveAddress", "true");

    await confirmShippingAction(orderId, fd);

    const address = await prisma.userAddress.findFirst({ where: { userId: buyerId } });
    expect(address).not.toBeNull();
    expect(address!.line1).toBe("123 Main St");
  });

  it("rejects if required fields are missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);

    const fd = new FormData();
    fd.set("name", "Jane Doe");
    // missing line1, city, postal

    const result = await confirmShippingAction(orderId, fd);
    expect(result).toHaveProperty("error");
  });

  it("rejects if a different user tries to confirm shipping", async () => {
    const stranger = await prisma.user.create({
      data: { email: "stranger@test.com", name: "Stranger", passwordHash: "x" },
    });
    vi.mocked(auth).mockResolvedValue({ user: { id: stranger.id, roles: ["BUYER"] } } as never);

    const fd = new FormData();
    fd.set("name", "Jane Doe");
    fd.set("line1", "123 Main St");
    fd.set("city", "Portland");
    fd.set("postal", "97201");

    const result = await confirmShippingAction(orderId, fd);
    expect(result).toHaveProperty("error");
  });

  it("unauthenticated user is redirected", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const fd = new FormData();

    await expect(confirmShippingAction(orderId, fd)).rejects.toThrow("NEXT_REDIRECT");
  });
});
