import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { checkAndSyncShipments, getOrderShipmentsView, aggregateOrderStatus } = await import("@/lib/checkout/shipments");

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

async function seedReferenced(sellerId: string) {
  return prisma.apparelListing.create({
    data: {
      sellerId, sourcingMode: "REFERENCED", title: "Powered By Plants", retailPrice: 32, status: "ACTIVE",
      providerKey: "teemill", providerProductRef: "ref",
      referencedVariants: { create: [{ variantRef: "vr", colorName: "Evergreen", colorHex: "#1", sizeLabel: "M", stockLevel: 5, isOrderable: true, mockupUrl: "x" }] },
    },
  });
}
async function seedPrint(sellerId: string) {
  const artwork = await prisma.artwork.create({ data: { sellerId, title: "Sunrise", description: "x", status: "PUBLISHED" } });
  return prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE", availableForPrint: true, printSourceImageUrl: "https://b/p.png", printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price: 40 }] },
  });
}

/** PAID cart order with a CONFIRMED Teemill FO + a CONFIRMED Prodigi FO (both placed). */
async function seedConfirmedOrder(buyerId: string, sellerId: string) {
  const ref = await seedReferenced(sellerId);
  const print = await seedPrint(sellerId);
  const order = await prisma.order.create({
    data: { buyerId, listingType: "CART", status: "PAID", subtotal: 72, totalAmount: 80, shippingCountry: "US" },
  });
  const teemillFo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "teemill", status: "CONFIRMED", providerOrderId: "t-123", shippingMethod: "standard", shippingCost: 3.99 } });
  const prodigiFo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "prodigi", status: "CONFIRMED", providerOrderId: "p-123", shippingMethod: "Standard", shippingCost: 4.99 } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: ref.id, selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1, unitPrice: 32, fulfillmentOrderId: teemillFo.id } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "PRINT", listingId: print.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 40 }, quantity: 1, unitPrice: 40, fulfillmentOrderId: prodigiFo.id } });
  return { order, teemillFo, prodigiFo };
}

/** Count MailerSend sends in the current test. */
function countEmails(): { get: () => number } {
  let n = 0;
  server.use(http.post("https://api.mailersend.com/v1/email", () => { n++; return HttpResponse.json({ id: "e" }); }));
  return { get: () => n };
}

// Teemill GET poll: dispatched with tracking.
function teemillDispatched() {
  server.use(
    http.get("https://api.teemill.com/v1/orders/:ref", () =>
      HttpResponse.json({ id: "t-123", status: "dispatched", fulfillments: [{ id: "f-1", status: "dispatched", trackingNumber: "TM-TRACK-1", carrier: "Royal Mail" }] }),
    ),
  );
}
// Prodigi GET: still in progress (not shipped).
function prodigiInProgress() {
  server.use(
    ...["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"].map((base) =>
      http.get(`${base}/orders/:id`, () => HttpResponse.json({ order: { id: "p-123", status: { stage: "InProgress" }, shipments: [] } })),
    ),
  );
}
function prodigiDispatched() {
  server.use(
    ...["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"].map((base) =>
      http.get(`${base}/orders/:id`, () =>
        HttpResponse.json({ order: { id: "p-123", status: { stage: "Complete" }, shipments: [{ tracking: { number: "PG-TRACK-9", carrier: "FedEx" } }] } }),
      ),
    ),
  );
}

describe("US-MFTF-12.6 — per-shipment status", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  describe("aggregateOrderStatus", () => {
    it("is Processing until all shipments ship, then Shipped", () => {
      expect(aggregateOrderStatus(["CONFIRMED", "SHIPPED"])).toBe("Processing");
      expect(aggregateOrderStatus(["SHIPPED", "SHIPPED"])).toBe("Shipped");
      expect(aggregateOrderStatus([])).toBe("Processing");
    });
  });

  describe("checkAndSyncShipments (polling reconciliation)", () => {
    it("marks a dispatched shipment SHIPPED with tracking and emails the buyer; order stays Processing until the other ships", async () => {
      teemillDispatched();
      prodigiInProgress();
      const emails = countEmails();
      const buyer = await seedUser();
      const seller = await seedUser();
      const { order, teemillFo, prodigiFo } = await seedConfirmedOrder(buyer.id, seller.id);

      const result = await checkAndSyncShipments();
      expect(result.shipped).toBe(1);

      const teemill = await prisma.fulfillmentOrder.findUnique({ where: { id: teemillFo.id } });
      const prodigi = await prisma.fulfillmentOrder.findUnique({ where: { id: prodigiFo.id } });
      expect(teemill!.status).toBe("SHIPPED");
      expect(teemill!.trackingNumber).toBe("TM-TRACK-1");
      expect(teemill!.carrier).toBe("Royal Mail");
      expect(prodigi!.status).toBe("CONFIRMED");
      expect(emails.get()).toBe(1);

      const view = await getOrderShipmentsView(order.id, buyer.id);
      expect(view!.aggregateStatus).toBe("Processing");
    });

    it("sends one email per shipment — two when both ship", async () => {
      teemillDispatched();
      prodigiDispatched();
      const emails = countEmails();
      const buyer = await seedUser();
      const seller = await seedUser();
      const { order } = await seedConfirmedOrder(buyer.id, seller.id);

      const result = await checkAndSyncShipments();
      expect(result.shipped).toBe(2);
      expect(emails.get()).toBe(2);

      const view = await getOrderShipmentsView(order.id, buyer.id);
      expect(view!.aggregateStatus).toBe("Shipped");
    });

    it("is idempotent — an already-SHIPPED shipment is not re-emailed", async () => {
      teemillDispatched();
      prodigiInProgress();
      const buyer = await seedUser();
      const seller = await seedUser();
      await seedConfirmedOrder(buyer.id, seller.id);
      await checkAndSyncShipments(); // teemill → SHIPPED

      const emails = countEmails();
      const second = await checkAndSyncShipments(); // teemill no longer CONFIRMED; prodigi still in progress
      expect(second.shipped).toBe(0);
      expect(emails.get()).toBe(0);
    });
  });

  describe("getOrderShipmentsView", () => {
    it("groups items as 'Shipment N of M' and never exposes provider names", async () => {
      const buyer = await seedUser();
      const seller = await seedUser();
      const { order } = await seedConfirmedOrder(buyer.id, seller.id);

      const view = await getOrderShipmentsView(order.id, buyer.id);
      expect(view!.shipments.map((s) => s.label)).toEqual(["Shipment 1 of 2", "Shipment 2 of 2"]);
      const serialized = JSON.stringify(view).toLowerCase();
      expect(serialized).not.toContain("teemill");
      expect(serialized).not.toContain("prodigi");
    });

    it("returns null for another buyer's order", async () => {
      const buyer = await seedUser();
      const other = await seedUser();
      const seller = await seedUser();
      const { order } = await seedConfirmedOrder(buyer.id, seller.id);
      expect(await getOrderShipmentsView(order.id, other.id)).toBeNull();
    });
  });
});
