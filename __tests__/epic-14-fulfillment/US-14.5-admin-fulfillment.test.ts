import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
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
}));

const { markShippedAction } = await import("@/app/actions/fulfillment");
const { auth } = await import("@/auth");

describe("US-14.5 — Admin Fulfillment Queue", () => {
  let adminId: string;
  let buyerId: string;
  let orderId: string;

  beforeEach(async () => {
    await resetDatabase();

    const admin = await prisma.user.create({
      data: { email: "admin@test.com", name: "Admin", passwordHash: "x", roles: ["ADMIN"] },
    });
    adminId = admin.id;

    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    const buyer = await prisma.user.create({
      data: { email: "buyer@test.com", name: "Buyer", passwordHash: "x", roles: ["BUYER"] },
    });
    buyerId = buyer.id;

    const artwork = await prisma.artwork.create({
      data: { title: "Art", description: "D", sellerId: seller.id, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "AUCTION", currency: "USD", status: "SOLD" },
    });
    const order = await prisma.order.create({
      data: {
        buyerId,
        listingType: "ORIGINAL",
        originalListingId: listing.id,
        subtotal: 500,
        totalAmount: 500,
        status: "PAID",
        shippingName: "Jane Doe",
        shippingLine1: "123 Main St",
        shippingCity: "Portland",
        shippingPostal: "97201",
        shippingCountry: "US",
      },
    });
    orderId = order.id;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("marks order as SHIPPED with carrier and tracking", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: adminId, roles: ["ADMIN"] } } as never);

    const fd = new FormData();
    fd.set("carrier", "UPS");
    fd.set("trackingNumber", "1Z999AA10123456784");

    const result = await markShippedAction(orderId, fd);
    expect(result).toEqual({ success: true });

    const updated = await prisma.order.findUnique({ where: { id: orderId } });
    expect(updated!.status).toBe("SHIPPED");
    expect(updated!.carrier).toBe("UPS");
    expect(updated!.trackingNumber).toBe("1Z999AA10123456784");
  });

  it("creates ORDER_SHIPPED notification for buyer", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: adminId, roles: ["ADMIN"] } } as never);

    const fd = new FormData();
    fd.set("carrier", "FedEx");
    fd.set("trackingNumber", "1234567890");

    await markShippedAction(orderId, fd);

    const notification = await prisma.notification.findFirst({
      where: { userId: buyerId, type: "ORDER_SHIPPED" },
    });
    expect(notification).not.toBeNull();
  });

  it("rejects if carrier or tracking number is missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: adminId, roles: ["ADMIN"] } } as never);

    const fd = new FormData();
    fd.set("carrier", "UPS");
    // missing trackingNumber

    const result = await markShippedAction(orderId, fd);
    expect(result).toHaveProperty("error");
  });

  it("non-admin is redirected", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);

    const fd = new FormData();
    fd.set("carrier", "UPS");
    fd.set("trackingNumber", "123");

    await expect(markShippedAction(orderId, fd)).rejects.toThrow("NEXT_REDIRECT");
  });
});
