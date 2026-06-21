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
const { getDropshipExceptionQueue, countDropshipExceptions, getOriginalsAwaitingSellerShipment } = await import("@/lib/fulfillment/admin");
const { retryFulfillmentAction } = await import("@/app/actions/fulfillment");
const { ensureOriginalFulfillmentOrder } = await import("@/lib/fulfillment/originals");

/** A PAID, address-confirmed ORIGINAL order owned by `sellerId`. */
async function seedOriginalOrder(sellerId: string, title = "Original") {
  const buyer = await seedUser(["BUYER"]);
  const artwork = await prisma.artwork.create({ data: { sellerId, title, description: "x", status: "PUBLISHED" } });
  const listing = await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 500, status: "SOLD" } });
  return prisma.order.create({
    data: { buyerId: buyer.id, listingType: "ORIGINAL", originalListingId: listing.id, subtotal: 500, totalAmount: 500, status: "PAID", shippingName: "Jane", shippingLine1: "1 St", shippingCity: "Portland", shippingPostal: "97201", shippingCountry: "US" },
  });
}

function useProdigiOrderOk() {
  server.use(
    http.post("https://api.prodigi.com/v4.0/orders", () =>
      HttpResponse.json({ order: { id: "prodigi-retry-1" } }, { status: 200 }),
    ),
  );
}

async function seedUser(roles: Array<"BUYER" | "SELLER" | "ADMIN">) {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@test.com`, name: "U", passwordHash: "x", roles } });
}

/** A PAID cart order with a single FAILED Prodigi print FulfillmentOrder. */
async function seedFailedDropship(sellerId: string) {
  const buyer = await seedUser(["BUYER"]);
  const artwork = await prisma.artwork.create({ data: { sellerId, title: "Sunrise", description: "x", status: "PUBLISHED" } });
  const print = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE", availableForPrint: true, printSourceImageUrl: "https://b/p.png", printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price: 40 }] },
  });
  const order = await prisma.order.create({
    data: { buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 40, totalAmount: 44, shippingName: "Jane", shippingLine1: "1 St", shippingCity: "Portland", shippingState: "OR", shippingPostal: "97201", shippingCountry: "US" },
  });
  const fo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "prodigi", status: "FAILED", notes: "earlier error", shippingMethod: "Standard", shippingCost: 4.99 } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "PRINT", listingId: print.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 40 }, quantity: 1, unitPrice: 40, fulfillmentOrderId: fo.id } });
  return { order, fo, buyer };
}

describe("US-MFTF-15.2 — admin dropship exception queue", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    useProdigiOrderOk();
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  describe("getDropshipExceptionQueue", () => {
    it("lists FAILED dropship shipments with the recorded error and buyer", async () => {
      const seller = await seedUser(["SELLER"]);
      const { fo, order } = await seedFailedDropship(seller.id);

      const rows = await getDropshipExceptionQueue();
      expect(rows).toHaveLength(1);
      expect(rows[0].fulfillmentOrderId).toBe(fo.id);
      expect(rows[0].orderId).toBe(order.id);
      expect(rows[0].notes).toBe("earlier error");
      expect(rows[0].buyerName).toBeTruthy();
    });

    it("never includes physical originals — only automated-provider failures", async () => {
      const seller = await seedUser(["SELLER"]);
      await seedFailedDropship(seller.id);

      // A paid original with its 'originals' FulfillmentOrder; even if forced FAILED it
      // must not appear in the admin exception queue.
      const buyer = await seedUser(["BUYER"]);
      const artwork = await prisma.artwork.create({ data: { sellerId: seller.id, title: "Orig", description: "x", status: "PUBLISHED" } });
      const listing = await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 500, status: "SOLD" } });
      const origOrder = await prisma.order.create({ data: { buyerId: buyer.id, listingType: "ORIGINAL", originalListingId: listing.id, subtotal: 500, totalAmount: 500, status: "PAID", shippingLine1: "1 St", shippingCity: "X", shippingPostal: "1", shippingCountry: "US" } });
      const origFo = await ensureOriginalFulfillmentOrder(origOrder.id);
      await prisma.fulfillmentOrder.update({ where: { id: origFo.id }, data: { status: "FAILED" } });

      const rows = await getDropshipExceptionQueue();
      expect(rows).toHaveLength(1);
      expect(rows.every((r) => r.fulfillmentOrderId !== origFo.id)).toBe(true);
    });
  });

  describe("retryFulfillmentAction", () => {
    it("admin retry moves a FAILED shipment to CONFIRMED with a provider order; idempotent on replay", async () => {
      const seller = await seedUser(["SELLER"]);
      const admin = await seedUser(["ADMIN"]);
      const { fo } = await seedFailedDropship(seller.id);
      vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, roles: ["ADMIN"] } } as never);

      const result = await retryFulfillmentAction(fo.id);
      expect(result).toEqual({ success: true });

      const retried = await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } });
      expect(retried!.status).toBe("CONFIRMED");
      expect(retried!.providerOrderId).toBeTruthy();
      const firstProviderOrderId = retried!.providerOrderId;

      // Replay — idempotent: the same provider order, not a duplicate.
      await retryFulfillmentAction(fo.id);
      const again = await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } });
      expect(again!.providerOrderId).toBe(firstProviderOrderId);
    });

    it("non-admin is redirected", async () => {
      const seller = await seedUser(["SELLER"]);
      const { fo } = await seedFailedDropship(seller.id);
      vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);

      await expect(retryFulfillmentAction(fo.id)).rejects.toThrow("NEXT_REDIRECT");
    });
  });

  describe("countDropshipExceptions (admin nav badge)", () => {
    it("counts only FAILED dropship shipments, never originals", async () => {
      const seller = await seedUser(["SELLER"]);
      await seedFailedDropship(seller.id);
      await seedFailedDropship(seller.id);
      // A FAILED originals FO must not be counted.
      const origOrder = await seedOriginalOrder(seller.id);
      const origFo = await ensureOriginalFulfillmentOrder(origOrder.id);
      await prisma.fulfillmentOrder.update({ where: { id: origFo.id }, data: { status: "FAILED" } });

      expect(await countDropshipExceptions()).toBe(2);
    });
  });

  describe("getOriginalsAwaitingSellerShipment (admin oversight)", () => {
    it("lists every seller's pending originals with the responsible seller", async () => {
      const sellerA = await prisma.user.create({ data: { email: `a-${crypto.randomUUID()}@test.com`, name: "Seller A", passwordHash: "x", roles: ["SELLER"] } });
      const sellerB = await prisma.user.create({ data: { email: `b-${crypto.randomUUID()}@test.com`, name: "Seller B", passwordHash: "x", roles: ["SELLER"] } });
      await seedOriginalOrder(sellerA.id, "Sunrise");
      await seedOriginalOrder(sellerB.id, "Moonset");

      const rows = await getOriginalsAwaitingSellerShipment();
      expect(rows).toHaveLength(2);
      const byArtwork = Object.fromEntries(rows.map((r) => [r.artworkTitle, r.sellerName]));
      expect(byArtwork["Sunrise"]).toBe("Seller A");
      expect(byArtwork["Moonset"]).toBe("Seller B");
    });

    it("excludes dropship orders and already-shipped originals", async () => {
      const seller = await seedUser(["SELLER"]);
      await seedFailedDropship(seller.id); // dropship — never here
      const shipped = await seedOriginalOrder(seller.id, "Shipped one");
      await prisma.order.update({ where: { id: shipped.id }, data: { status: "SHIPPED" } });

      const rows = await getOriginalsAwaitingSellerShipment();
      expect(rows).toHaveLength(0);
    });
  });
});
