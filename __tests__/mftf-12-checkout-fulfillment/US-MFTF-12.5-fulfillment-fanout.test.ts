import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { dispatchOrderFulfillment, retryFulfillmentOrder } = await import("@/lib/checkout/fanout");

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

async function seedReferenced(sellerId: string) {
  return prisma.apparelListing.create({
    data: {
      sellerId, sourcingMode: "REFERENCED", title: "Powered By Plants", retailPrice: 32, status: "ACTIVE",
      providerKey: "teemill", providerProductRef: "ref", providerBaseCurrency: "GBP", providerBasePrice: 21,
      referencedVariants: { create: [{ variantRef: "https://api.teemill.com/v1/catalog/variants/uuid-v-evergreen-m", colorName: "Evergreen", colorHex: "#23312d", sizeLabel: "M", stockLevel: 73, isOrderable: true, mockupUrl: "x" }] },
    },
  });
}

async function seedPrint(sellerId: string) {
  const artwork = await prisma.artwork.create({ data: { sellerId, title: "Sunrise", description: "x", status: "PUBLISHED" } });
  return prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE", availableForPrint: true, printSourceImageUrl: "https://b/p.png", printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price: 40 }] },
  });
}

/** Build a PAID cart order with a Teemill FO (referenced apparel) + a Prodigi FO (print). */
async function seedCartOrder(buyerId: string, sellerId: string) {
  const ref = await seedReferenced(sellerId);
  const print = await seedPrint(sellerId);
  const order = await prisma.order.create({
    data: {
      buyerId, listingType: "CART", status: "PAID", subtotal: 72, totalAmount: 80,
      shippingName: "Jane", shippingLine1: "1 St", shippingCity: "Portland", shippingState: "OR", shippingPostal: "97201", shippingCountry: "US",
    },
  });
  const teemillFo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "teemill", status: "PENDING", shippingMethod: "Standard", shippingCost: 3.99 } });
  const prodigiFo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "prodigi", status: "PENDING", shippingMethod: "Standard", shippingCost: 4.99 } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: ref.id, selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1, unitPrice: 32, fulfillmentOrderId: teemillFo.id } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "PRINT", listingId: print.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 40 }, quantity: 1, unitPrice: 40, fulfillmentOrderId: prodigiFo.id } });
  return { order, teemillFo, prodigiFo };
}

function useTeemillConfirmOk() {
  server.use(
    http.post("https://api.teemill.com/v1/orders/:id/confirm", () =>
      HttpResponse.json({ id: "mock-order-id-123", status: "confirmed" }, { status: 200 }),
    ),
  );
}

describe("US-MFTF-12.5 — post-payment fulfillment fan-out", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    useTeemillConfirmOk();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("dispatches every FulfillmentOrder through provider.fulfill() → CONFIRMED with providerOrderId", async () => {
    const buyer = await seedUser();
    const seller = await seedUser();
    const { order } = await seedCartOrder(buyer.id, seller.id);

    await dispatchOrderFulfillment(order.id);

    const fos = await prisma.fulfillmentOrder.findMany({ where: { orderId: order.id } });
    expect(fos).toHaveLength(2);
    for (const fo of fos) {
      expect(fo.status).toBe("CONFIRMED");
      expect(fo.providerOrderId).toBeTruthy();
    }
  });

  it("isolates failure: a Teemill confirm 500 fails only its shipment; the Prodigi shipment still CONFIRMED", async () => {
    server.use(
      http.post("https://api.teemill.com/v1/orders/:id/confirm", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const buyer = await seedUser();
    const seller = await seedUser();
    const { order, teemillFo, prodigiFo } = await seedCartOrder(buyer.id, seller.id);

    await dispatchOrderFulfillment(order.id);

    const teemill = await prisma.fulfillmentOrder.findUnique({ where: { id: teemillFo.id } });
    const prodigi = await prisma.fulfillmentOrder.findUnique({ where: { id: prodigiFo.id } });
    expect(teemill!.status).toBe("FAILED");
    expect(teemill!.notes).toBeTruthy();
    expect(prodigi!.status).toBe("CONFIRMED");
    expect(prodigi!.providerOrderId).toBeTruthy();
  });

  it("is idempotent: a FulfillmentOrder already CONFIRMED with a providerOrderId is not re-dispatched", async () => {
    const buyer = await seedUser();
    const seller = await seedUser();
    const { order, prodigiFo } = await seedCartOrder(buyer.id, seller.id);
    await prisma.fulfillmentOrder.update({
      where: { id: prodigiFo.id },
      data: { status: "CONFIRMED", providerOrderId: "already-placed" },
    });

    await dispatchOrderFulfillment(order.id);

    const prodigi = await prisma.fulfillmentOrder.findUnique({ where: { id: prodigiFo.id } });
    expect(prodigi!.providerOrderId).toBe("already-placed"); // unchanged — not re-placed
  });

  it("retryFulfillmentOrder re-runs a single FAILED shipment to CONFIRMED", async () => {
    const buyer = await seedUser();
    const seller = await seedUser();
    const { teemillFo } = await seedCartOrder(buyer.id, seller.id);
    await prisma.fulfillmentOrder.update({ where: { id: teemillFo.id }, data: { status: "FAILED", notes: "earlier error" } });

    await retryFulfillmentOrder(teemillFo.id);

    const teemill = await prisma.fulfillmentOrder.findUnique({ where: { id: teemillFo.id } });
    expect(teemill!.status).toBe("CONFIRMED");
    expect(teemill!.providerOrderId).toBeTruthy();
  });
});
