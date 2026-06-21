import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { auth } = await import("@/auth");
const { getSellerOriginalsQueue, ensureOriginalFulfillmentOrder } = await import("@/lib/fulfillment/originals");
const { markOriginalShippedAction, markOriginalDeliveredAction } = await import("@/app/actions/fulfillment");

/** Capture every MailerSend send (subject + html body) in the current test. */
function captureEmails(): { sends: Array<{ subject: string; html: string; to: string }> } {
  const sends: Array<{ subject: string; html: string; to: string }> = [];
  server.use(
    http.post("https://api.mailersend.com/v1/email", async ({ request }) => {
      const body = (await request.json()) as { subject: string; html: string; to: Array<{ email: string }> };
      sends.push({ subject: body.subject, html: body.html, to: body.to[0]?.email });
      return HttpResponse.json({ id: "e" });
    }),
  );
  return { sends };
}

async function seedSeller(email: string) {
  return prisma.user.create({ data: { email, name: email, passwordHash: "x", roles: ["SELLER"] } });
}

/** A PAID, address-confirmed ORIGINAL order for `sellerId`, with an artwork image. */
async function seedOriginalOrder(sellerId: string, opts: { buyerEmail?: string; title?: string } = {}) {
  const buyer = await prisma.user.create({
    data: { email: opts.buyerEmail ?? `buyer-${crypto.randomUUID()}@test.com`, name: "Buyer", passwordHash: "x", roles: ["BUYER"] },
  });
  const artwork = await prisma.artwork.create({
    data: {
      title: opts.title ?? "Sunrise Original",
      description: "D",
      sellerId,
      status: "PUBLISHED",
      images: { create: [{ url: "https://blob.example.com/orig.png", thumbnailUrl: "https://blob.example.com/thumb.png", gridUrl: "https://blob.example.com/grid.png", isPrimary: true, order: 0 }] },
    },
  });
  const listing = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 500, currency: "USD", status: "SOLD" },
  });
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
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
  return { buyer, artwork, listing, order };
}

/** A PAID CART order with a dropship apparel FulfillmentOrder — must NOT appear in the seller queue. */
async function seedDropshipOrder(sellerId: string) {
  const buyer = await prisma.user.create({ data: { email: `dbuyer-${crypto.randomUUID()}@test.com`, roles: ["BUYER"] } });
  const order = await prisma.order.create({
    data: { buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 32, totalAmount: 36, shippingLine1: "1 St", shippingCity: "X", shippingPostal: "1", shippingCountry: "US" },
  });
  const listing = await prisma.apparelListing.create({
    data: { sellerId, sourcingMode: "REFERENCED", title: "Tee", retailPrice: 32, status: "ACTIVE", providerKey: "teemill", providerProductRef: "ref" },
  });
  const fo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "teemill", status: "CONFIRMED", providerOrderId: "t-1", shippingCost: 0 } });
  await prisma.orderItem.create({
    data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1, unitPrice: 32, fulfillmentOrderId: fo.id },
  });
  return { order, fo };
}

describe("US-MFTF-15.1 — seller originals fulfillment queue", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  describe("getSellerOriginalsQueue", () => {
    it("lists the seller's own paid, address-confirmed, not-yet-shipped originals with row details", async () => {
      const seller = await seedSeller("a@test.com");
      const { order, artwork } = await seedOriginalOrder(seller.id, { title: "Sunrise" });

      const rows = await getSellerOriginalsQueue(seller.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].orderId).toBe(order.id);
      expect(rows[0].title).toBe("Sunrise");
      expect(rows[0].thumbnailUrl).toBe("https://blob.example.com/thumb.png");
      expect(rows[0].buyerName).toBeTruthy();
      expect(rows[0].shippingLine1).toBe("123 Main St");
      expect(rows[0].totalAmount).toBe(500);
      expect(rows[0].paidAt).toBeInstanceOf(Date);
      void artwork;
    });

    it("is seller-locked: another seller's originals never appear", async () => {
      const sellerA = await seedSeller("a@test.com");
      const sellerB = await seedSeller("b@test.com");
      await seedOriginalOrder(sellerA.id);
      const { order: bOrder } = await seedOriginalOrder(sellerB.id);

      const rowsA = await getSellerOriginalsQueue(sellerA.id);
      expect(rowsA.every((r) => r.orderId !== bOrder.id)).toBe(true);
      expect(rowsA).toHaveLength(1);
    });

    it("excludes dropship (apparel/print) line items — they fulfill automatically", async () => {
      const seller = await seedSeller("a@test.com");
      await seedDropshipOrder(seller.id);

      const rows = await getSellerOriginalsQueue(seller.id);
      expect(rows).toHaveLength(0);
    });

    it("excludes originals without a confirmed shipping address", async () => {
      const seller = await seedSeller("a@test.com");
      const { order } = await seedOriginalOrder(seller.id);
      await prisma.order.update({ where: { id: order.id }, data: { shippingLine1: null } });

      const rows = await getSellerOriginalsQueue(seller.id);
      expect(rows).toHaveLength(0);
    });

    it("excludes originals that have already shipped", async () => {
      const seller = await seedSeller("a@test.com");
      const { order } = await seedOriginalOrder(seller.id);
      await prisma.order.update({ where: { id: order.id }, data: { status: "SHIPPED" } });

      const rows = await getSellerOriginalsQueue(seller.id);
      expect(rows).toHaveLength(0);
    });
  });

  describe("ensureOriginalFulfillmentOrder", () => {
    it("creates exactly one originals FulfillmentOrder, idempotently", async () => {
      const seller = await seedSeller("a@test.com");
      const { order } = await seedOriginalOrder(seller.id);

      const fo1 = await ensureOriginalFulfillmentOrder(order.id);
      const fo2 = await ensureOriginalFulfillmentOrder(order.id);
      expect(fo1.id).toBe(fo2.id);
      expect(fo1.provider).toBe("originals");
      expect(fo1.status).toBe("CONFIRMED");

      const all = await prisma.fulfillmentOrder.findMany({ where: { orderId: order.id } });
      expect(all).toHaveLength(1);
    });
  });

  describe("markOriginalShippedAction", () => {
    it("seller ships their own original: persists tracking, transitions, fires the SHIPPED email (14.3 path)", async () => {
      const seller = await seedSeller("a@test.com");
      const { order, buyer } = await seedOriginalOrder(seller.id);
      vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
      const { sends } = captureEmails();

      const fd = new FormData();
      fd.set("carrier", "UPS");
      fd.set("trackingNumber", "1Z999AA10123456784");
      const result = await markOriginalShippedAction(order.id, fd);
      expect(result).toEqual({ success: true });

      const fo = await prisma.fulfillmentOrder.findFirst({ where: { orderId: order.id } });
      expect(fo!.provider).toBe("originals");
      expect(fo!.status).toBe("SHIPPED");
      expect(fo!.trackingNumber).toBe("1Z999AA10123456784");
      expect(fo!.carrier).toBe("UPS");

      const updated = await prisma.order.findUnique({ where: { id: order.id } });
      expect(updated!.status).toBe("SHIPPED");
      expect(updated!.trackingNumber).toBe("1Z999AA10123456784");

      // Same path as US-MFTF-14.3 → the per-shipment SHIPPED email fired to the buyer.
      expect(sends).toHaveLength(1);
      expect(sends[0].to).toBe(buyer.email);
      expect(sends[0].subject.toLowerCase()).toContain("on its way");
      expect(sends[0].html).toContain("1Z999AA10123456784");
      // The artwork thumbnail (our domain) renders; no provider names anywhere.
      expect(sends[0].html).toContain("https://blob.example.com/grid.png");
      expect(JSON.stringify(sends).toLowerCase()).not.toContain("prodigi");
      expect(JSON.stringify(sends).toLowerCase()).not.toContain("teemill");
      expect(JSON.stringify(sends).toLowerCase()).not.toContain("originals");
    });

    it("rejects when carrier or tracking number is missing", async () => {
      const seller = await seedSeller("a@test.com");
      const { order } = await seedOriginalOrder(seller.id);
      vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);

      const fd = new FormData();
      fd.set("carrier", "UPS");
      const result = await markOriginalShippedAction(order.id, fd);
      expect(result).toHaveProperty("error");
    });

    it("non-seller is redirected", async () => {
      const seller = await seedSeller("a@test.com");
      const { order } = await seedOriginalOrder(seller.id);
      vi.mocked(auth).mockResolvedValue({ user: { id: "someone", roles: ["BUYER"] } } as never);

      const fd = new FormData();
      fd.set("carrier", "UPS");
      fd.set("trackingNumber", "X");
      await expect(markOriginalShippedAction(order.id, fd)).rejects.toThrow("NEXT_REDIRECT");
    });

    it("a seller cannot ship another seller's original", async () => {
      const sellerA = await seedSeller("a@test.com");
      const sellerB = await seedSeller("b@test.com");
      const { order } = await seedOriginalOrder(sellerA.id);
      vi.mocked(auth).mockResolvedValue({ user: { id: sellerB.id, roles: ["SELLER"] } } as never);

      const fd = new FormData();
      fd.set("carrier", "UPS");
      fd.set("trackingNumber", "X");
      const result = await markOriginalShippedAction(order.id, fd);
      expect(result).toHaveProperty("error");

      const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
      expect(unchanged!.status).toBe("PAID");
    });
  });

  describe("markOriginalDeliveredAction", () => {
    it("seller marks delivered: transitions to DELIVERED and fires the DELIVERED email (14.3 path)", async () => {
      const seller = await seedSeller("a@test.com");
      const { order, buyer } = await seedOriginalOrder(seller.id);
      vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);

      // First ship it.
      const shipFd = new FormData();
      shipFd.set("carrier", "UPS");
      shipFd.set("trackingNumber", "TRACK1");
      await markOriginalShippedAction(order.id, shipFd);

      const { sends } = captureEmails();
      const result = await markOriginalDeliveredAction(order.id);
      expect(result).toEqual({ success: true });

      const fo = await prisma.fulfillmentOrder.findFirst({ where: { orderId: order.id } });
      expect(fo!.status).toBe("DELIVERED");
      const updated = await prisma.order.findUnique({ where: { id: order.id } });
      expect(updated!.status).toBe("DELIVERED");

      expect(sends).toHaveLength(1);
      expect(sends[0].to).toBe(buyer.email);
      expect(sends[0].subject.toLowerCase()).toContain("delivered");
    });

    it("non-seller is redirected", async () => {
      const seller = await seedSeller("a@test.com");
      const { order } = await seedOriginalOrder(seller.id);
      vi.mocked(auth).mockResolvedValue({ user: { id: "x", roles: ["BUYER"] } } as never);
      await expect(markOriginalDeliveredAction(order.id)).rejects.toThrow("NEXT_REDIRECT");
    });
  });
});
