import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

// US-MFTF-17.2 — multi-provider fan-out with a Printify line item. A cart order
// containing a Printify (designed apparel) item alongside a Prodigi (print) item
// splits into independent FulfillmentOrders; the Printify item reaches Printify as
// blueprint+provider+variant + the design; one provider failing never blocks the
// other; and NO Printify identity leaks into the buyer-facing order view.

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { dispatchOrderFulfillment } = await import("@/lib/checkout/fanout");
const { getOrderShipmentsView } = await import("@/lib/checkout/shipments");

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

/** A designed Printify apparel listing offering Black / M → Printify variant 17402. */
async function seedPrintifyListing(sellerId: string) {
  const pt = await prisma.productType.create({
    data: {
      name: `Printify Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRINTIFY",
      printifyBlueprintId: 5,
      printifyPrintProviderId: 41,
      colors: { create: [{ colorName: "Black", providerColorCode: "Black", colorImageUrl: null }] },
      sizes: { create: [{ sizeLabel: "M", providerSizeCode: "M", sortOrder: 0 }] },
      printifyVariants: { create: [{ colorName: "Black", sizeLabel: "M", printifyVariantId: 17402 }] },
    },
  });
  return prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "DESIGNED",
      productTypeId: pt.id,
      title: "Solar Bloom Tee",
      retailPrice: 35,
      status: "ACTIVE",
      designImageUrl: "https://blob/printify-design.png",
    },
  });
}

async function seedPrint(sellerId: string) {
  const artwork = await prisma.artwork.create({ data: { sellerId, title: "Sunrise", description: "x", status: "PUBLISHED" } });
  return prisma.originalListing.create({
    data: {
      artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE",
      availableForPrint: true, printSourceImageUrl: "https://b/p.png",
      printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price: 40 }],
    },
  });
}

/** A PAID cart order: a Printify FO (designed apparel) + a Prodigi FO (print). */
async function seedCartOrder(buyerId: string, sellerId: string) {
  const apparel = await seedPrintifyListing(sellerId);
  const print = await seedPrint(sellerId);
  const order = await prisma.order.create({
    data: {
      buyerId, listingType: "CART", status: "PAID", subtotal: 75, totalAmount: 85,
      shippingName: "Jane", shippingLine1: "1 St", shippingCity: "Portland",
      shippingState: "OR", shippingPostal: "97201", shippingCountry: "US",
    },
  });
  const printifyFo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "printify", status: "PENDING", shippingMethod: "standard", shippingCost: 19.59 } });
  const prodigiFo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "prodigi", status: "PENDING", shippingMethod: "Standard", shippingCost: 4.99 } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: apparel.id, selection: { colorId: "Black", sizeLabel: "M" }, quantity: 1, unitPrice: 35, fulfillmentOrderId: printifyFo.id } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "PRINT", listingId: print.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 40 }, quantity: 1, unitPrice: 40, fulfillmentOrderId: prodigiFo.id } });
  return { order, printifyFo, prodigiFo };
}

/** Happy-path Printify order handlers; capture the created order body. */
function stubPrintifyOrders() {
  let orderBody: { line_items?: Array<Record<string, unknown>> } | null = null;
  server.use(
    http.post("https://api.printify.com/v1/shops/:shop/orders.json", async ({ request }) => {
      orderBody = (await request.json()) as typeof orderBody;
      return HttpResponse.json({ id: "printify-order-1", status: "pending" });
    }),
    http.post("https://api.printify.com/v1/shops/:shop/orders/:id/send-to-production.json", () =>
      HttpResponse.json({ id: "printify-order-1", status: "in-production" }),
    ),
  );
  return { get: () => orderBody };
}

describe("US-MFTF-17.2 — Printify fan-out split", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("dispatches the Printify and Prodigi shipments independently → both CONFIRMED", async () => {
    stubPrintifyOrders();
    const buyer = await seedUser();
    const seller = await seedUser();
    const { order, printifyFo } = await seedCartOrder(buyer.id, seller.id);

    await dispatchOrderFulfillment(order.id);

    const fos = await prisma.fulfillmentOrder.findMany({ where: { orderId: order.id } });
    expect(fos).toHaveLength(2);
    for (const fo of fos) expect(fo.status).toBe("CONFIRMED");
    const printify = await prisma.fulfillmentOrder.findUnique({ where: { id: printifyFo.id } });
    expect(printify!.providerOrderId).toBe("printify-order-1");
  });

  it("builds the Printify order line from the (colour,size)→variant map + the design", async () => {
    const cap = stubPrintifyOrders();
    const buyer = await seedUser();
    const seller = await seedUser();
    const { order } = await seedCartOrder(buyer.id, seller.id);

    await dispatchOrderFulfillment(order.id);

    const line = cap.get()!.line_items![0];
    expect(line).toMatchObject({ blueprint_id: 5, print_provider_id: 41, variant_id: 17402, quantity: 1 });
    // The design URL reaches the order's print area, keyed by position.
    expect(line.print_areas).toEqual({ front: "https://blob/printify-design.png" });
  });

  it("isolates failure: a Printify order 500 fails only its shipment; Prodigi still CONFIRMED", async () => {
    server.use(
      http.post("https://api.printify.com/v1/shops/:shop/orders.json", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const buyer = await seedUser();
    const seller = await seedUser();
    const { order, printifyFo, prodigiFo } = await seedCartOrder(buyer.id, seller.id);

    await dispatchOrderFulfillment(order.id);

    const printify = await prisma.fulfillmentOrder.findUnique({ where: { id: printifyFo.id } });
    const prodigi = await prisma.fulfillmentOrder.findUnique({ where: { id: prodigiFo.id } });
    expect(printify!.status).toBe("FAILED");
    expect(printify!.notes).toBeTruthy();
    expect(prodigi!.status).toBe("CONFIRMED");
    expect(prodigi!.providerOrderId).toBeTruthy();
  });

  it("never leaks Printify identity into the buyer-facing shipments view (opacity)", async () => {
    stubPrintifyOrders();
    const buyer = await seedUser();
    const seller = await seedUser();
    const { order } = await seedCartOrder(buyer.id, seller.id);
    await dispatchOrderFulfillment(order.id);

    const view = await getOrderShipmentsView(order.id, buyer.id);
    expect(view).not.toBeNull();
    const serialized = JSON.stringify(view).toLowerCase();
    expect(serialized).not.toContain("printify");
    expect(serialized).not.toContain("blueprint");
    expect(serialized).not.toContain("17402"); // variant id
    // Buyer sees neutral "Shipment N of M" labels.
    expect(view!.shipments.every((s) => /shipment \d+ of \d+/i.test(s.label))).toBe(true);
  });
});
