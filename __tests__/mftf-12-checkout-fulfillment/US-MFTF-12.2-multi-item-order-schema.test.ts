import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase, prisma } from "../helpers/db";

// ─── US-MFTF-12.2 — Multi-item order schema ───────────────────────────────────
// Integration tests against the test DB. OrderItem + FulfillmentOrder let one
// buyer-facing Order hold multiple items split across multiple providers.

const { validateOrderItemReference, validateOrderShape } = await import("@/lib/orders/invariants");

async function seedBuyer() {
  return prisma.user.create({ data: { email: `buyer-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

async function seedApparelListing(sellerId: string) {
  return prisma.apparelListing.create({
    data: { sellerId, title: "Solar Punk Bee Tee", retailPrice: 32, status: "ACTIVE" },
  });
}

async function seedOriginalListing(sellerId: string) {
  const artwork = await prisma.artwork.create({
    data: { sellerId, title: "Sunrise", description: "An original.", status: "PUBLISHED" },
  });
  return prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE", availableForPrint: true },
  });
}

describe("US-MFTF-12.2 — multi-item order schema", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("creates an Order with two OrderItems split across two FulfillmentOrders", async () => {
    const buyer = await seedBuyer();
    const apparel = await seedApparelListing(buyer.id);
    const original = await seedOriginalListing(buyer.id);

    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "PRINT",
        subtotal: 64,
        totalAmount: 71.98,
        fulfillmentOrders: {
          create: [
            { provider: "teemill", status: "PENDING", shippingMethod: "standard", shippingCost: 3.99 },
            { provider: "prodigi", status: "PENDING", shippingMethod: "standard", shippingCost: 4.99 },
          ],
        },
      },
      include: { fulfillmentOrders: true },
    });

    const [teemillFo, prodigiFo] = order.fulfillmentOrders.sort((a, b) => a.provider.localeCompare(b.provider) > 0 ? 1 : -1);

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        itemKind: "APPAREL",
        apparelListingId: apparel.id,
        selection: { colorId: "Moss", sizeLabel: "M" },
        quantity: 1,
        unitPrice: 32,
        fulfillmentOrderId: teemillFo.id,
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        itemKind: "PRINT",
        listingId: original.id,
        selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 32 },
        quantity: 1,
        unitPrice: 32,
        fulfillmentOrderId: prodigiFo.id,
      },
    });

    const fetched = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        orderItems: { include: { fulfillmentOrder: true } },
        fulfillmentOrders: { include: { items: true } },
      },
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.orderItems).toHaveLength(2);
    expect(fetched!.fulfillmentOrders).toHaveLength(2);
    // Single-FK legacy fields are null on a cart-style order.
    expect(fetched!.originalListingId).toBeNull();
    expect(fetched!.apparelListingId).toBeNull();
    // Each fulfillment order owns exactly one item.
    for (const fo of fetched!.fulfillmentOrders) expect(fo.items).toHaveLength(1);
    // unitPrice captured as Decimal.
    expect(Number(fetched!.orderItems[0].unitPrice)).toBe(32);
  });

  it("FulfillmentOrder status enum accepts all five values", async () => {
    const buyer = await seedBuyer();
    for (const status of ["PENDING", "SUBMITTED", "CONFIRMED", "SHIPPED", "FAILED"] as const) {
      const order = await prisma.order.create({
        data: { buyerId: buyer.id, listingType: "PRINT", subtotal: 1, totalAmount: 1 },
      });
      const fo = await prisma.fulfillmentOrder.create({
        data: { orderId: order.id, provider: "prodigi", status, shippingCost: 0 },
      });
      expect(fo.status).toBe(status);
    }
  });

  it("retains legacy single-FK Order fields for original buy-now flows", async () => {
    const buyer = await seedBuyer();
    const original = await seedOriginalListing(buyer.id);
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "ORIGINAL",
        originalListingId: original.id,
        subtotal: 100,
        totalAmount: 100,
      },
    });
    expect(order.originalListingId).toBe(original.id);
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(items).toHaveLength(0);
  });

  it("cascades OrderItem + FulfillmentOrder deletion when the Order is deleted", async () => {
    const buyer = await seedBuyer();
    const apparel = await seedApparelListing(buyer.id);
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        listingType: "PRINT",
        subtotal: 32,
        totalAmount: 32,
        fulfillmentOrders: { create: [{ provider: "teemill", shippingCost: 0 }] },
        orderItems: {
          create: [{ itemKind: "APPAREL", apparelListingId: apparel.id, selection: {}, quantity: 1, unitPrice: 32 }],
        },
      },
    });
    await prisma.order.delete({ where: { id: order.id } });
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.fulfillmentOrder.count({ where: { orderId: order.id } })).toBe(0);
  });

  describe("app-layer invariants", () => {
    it("validateOrderItemReference rejects setting both FKs", () => {
      const r = validateOrderItemReference({ itemKind: "APPAREL", apparelListingId: "a", listingId: "b" });
      expect(r.valid).toBe(false);
    });

    it("validateOrderItemReference rejects setting neither FK", () => {
      const r = validateOrderItemReference({ itemKind: "APPAREL" });
      expect(r.valid).toBe(false);
    });

    it("validateOrderItemReference requires apparelListingId for APPAREL", () => {
      expect(validateOrderItemReference({ itemKind: "APPAREL", listingId: "b" }).valid).toBe(false);
      expect(validateOrderItemReference({ itemKind: "APPAREL", apparelListingId: "a" }).valid).toBe(true);
    });

    it("validateOrderItemReference requires listingId for PRINT", () => {
      expect(validateOrderItemReference({ itemKind: "PRINT", apparelListingId: "a" }).valid).toBe(false);
      expect(validateOrderItemReference({ itemKind: "PRINT", listingId: "b" }).valid).toBe(true);
    });

    it("validateOrderShape rejects an Order with both a single FK and OrderItem rows", () => {
      const r = validateOrderShape({ apparelListingId: "a", originalListingId: null, orderItemCount: 2 });
      expect(r.valid).toBe(false);
    });

    it("validateOrderShape accepts a legacy single-FK order", () => {
      expect(validateOrderShape({ originalListingId: "x", apparelListingId: null, orderItemCount: 0 }).valid).toBe(true);
    });

    it("validateOrderShape accepts a cart order with only OrderItem rows", () => {
      expect(validateOrderShape({ originalListingId: null, apparelListingId: null, orderItemCount: 3 }).valid).toBe(true);
    });
  });
});
