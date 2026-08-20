import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

// US-MFTF-17.9 — order-time placement wiring. When a listing has a saved
// ApparelListingPrintifyPlacement, the Printify order line emits the POSITIONED
// print_areas form ({ [pos]: [{ src, x, y, scale, angle }] }); when it does not, it
// keeps sending today's simple URL form ({ [pos]: "<url>" }). The regression pin on
// the simple form protects every listing already live that never used the tool.

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { dispatchOrderFulfillment } = await import("@/lib/checkout/fanout");
const { PrintifyFulfillmentProvider } = await import("@/lib/fulfillment/providers/printify");
import type { FulfillmentJob, ShippingQuoteItem } from "@/lib/fulfillment/types";

const ADDRESS = {
  name: "Jane Smith",
  line1: "1 Main St",
  city: "Portland",
  state: "OR",
  postal: "97201",
  country: "US",
};

/** Capture the created Printify order body. */
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

// ─── Provider-level: createProviderOrder branches on item.placement ────────────

describe("US-MFTF-17.9 — positioned vs simple print_areas (provider)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  const baseItem: ShippingQuoteItem = {
    printifyBlueprintId: 5,
    printifyPrintProviderId: 41,
    printifyVariantId: 17391,
    quantity: 1,
    sourceImageUrl: "https://blob.example.com/design.png",
    printArea: "front",
  };

  it("emits the POSITIONED array form when the item carries a placement", async () => {
    const cap = stubPrintifyOrders();
    const item: ShippingQuoteItem = {
      ...baseItem,
      placement: { x: 0.6, y: 0.4, scale: 1.2, angle: 15 },
    };
    const job: FulfillmentJob = { items: [item], shippingAddress: ADDRESS };
    await new PrintifyFulfillmentProvider().fulfill(job);

    const line = cap.get()!.line_items![0];
    expect(line.print_areas).toEqual({
      front: [{ src: "https://blob.example.com/design.png", x: 0.6, y: 0.4, scale: 1.2, angle: 15 }],
    });
  });

  it("keeps the simple URL form when the item has no placement (regression pin)", async () => {
    const cap = stubPrintifyOrders();
    const job: FulfillmentJob = { items: [baseItem], shippingAddress: ADDRESS };
    await new PrintifyFulfillmentProvider().fulfill(job);

    const line = cap.get()!.line_items![0];
    expect(line.print_areas).toEqual({ front: "https://blob.example.com/design.png" });
  });
});

// ─── Fan-out: toQuoteItem attaches a saved placement, omits when none ──────────

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

async function seedPrintifyOrder(withPlacement: boolean) {
  const buyer = await seedUser();
  const seller = await seedUser();
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
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId: seller.id,
      sourcingMode: "DESIGNED",
      productTypeId: pt.id,
      title: "Solar Bloom Tee",
      retailPrice: 35,
      status: "ACTIVE",
      designImageUrl: "https://blob/printify-design.png",
    },
  });
  if (withPlacement) {
    await prisma.apparelListingPrintifyPlacement.create({
      data: { apparelListingId: listing.id, x: 0.3, y: 0.7, scale: 0.8, angle: -30 },
    });
  }
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 35, totalAmount: 55,
      shippingName: "Jane", shippingLine1: "1 St", shippingCity: "Portland",
      shippingState: "OR", shippingPostal: "97201", shippingCountry: "US",
    },
  });
  const fo = await prisma.fulfillmentOrder.create({
    data: { orderId: order.id, provider: "printify", status: "PENDING", shippingMethod: "standard", shippingCost: 19.59 },
  });
  await prisma.orderItem.create({
    data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "Black", sizeLabel: "M" }, quantity: 1, unitPrice: 35, fulfillmentOrderId: fo.id },
  });
  return { order };
}

describe("US-MFTF-17.9 — fan-out attaches a saved placement", () => {
  beforeEach(async () => { await resetDatabase(); vi.clearAllMocks(); });
  afterEach(async () => resetDatabase());

  it("sends the positioned form for a listing with a saved placement", async () => {
    const cap = stubPrintifyOrders();
    const { order } = await seedPrintifyOrder(true);
    await dispatchOrderFulfillment(order.id);

    const line = cap.get()!.line_items![0];
    expect(line.print_areas).toEqual({
      front: [{ src: "https://blob/printify-design.png", x: 0.3, y: 0.7, scale: 0.8, angle: -30 }],
    });
  });

  it("sends the simple URL form for a listing with no saved placement", async () => {
    const cap = stubPrintifyOrders();
    const { order } = await seedPrintifyOrder(false);
    await dispatchOrderFulfillment(order.id);

    const line = cap.get()!.line_items![0];
    expect(line.print_areas).toEqual({ front: "https://blob/printify-design.png" });
  });
});
