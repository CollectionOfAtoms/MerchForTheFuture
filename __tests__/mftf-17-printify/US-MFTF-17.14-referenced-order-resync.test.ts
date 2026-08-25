import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";
import { buildPrintifyReferencedProduct, PRINTIFY_PRODUCT_ID } from "../mocks/printify-fixture";

// US-MFTF-17.14 — REFERENCED Printify order + re-sync. A referenced-Printify item is
// ordered by { product_id, variant_id, quantity } (the product is already built in
// our shop), distinct from the DESIGNED print_areas branch (US-MFTF-17.9). A
// regression pin keeps designed items on print_areas. Re-sync re-runs the 17.12 ingest.

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { dispatchOrderFulfillment } = await import("@/lib/checkout/fanout");
const { PrintifyFulfillmentProvider } = await import("@/lib/fulfillment/providers/printify");
const { resyncReferencedListingAction } = await import("@/app/actions/referenced-apparel");
const { ingestPrintifyProduct, applyPrintifySnapshot } = await import("@/lib/fulfillment/printify");
const { auth } = await import("@/auth");
import type { FulfillmentJob, ShippingQuoteItem } from "@/lib/fulfillment/types";

const ADDRESS = {
  name: "Jane Smith",
  line1: "1 Main St",
  city: "Portland",
  state: "OR",
  postal: "97201",
  country: "US",
};

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

// ─── Provider-level: createProviderOrder forks referenced vs designed ─────────

describe("US-MFTF-17.14 — referenced vs designed Printify order line (provider)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("emits { product_id, variant_id, quantity } for a referenced item", async () => {
    const cap = stubPrintifyOrders();
    const item: ShippingQuoteItem = {
      variantRef: "17402",
      printifyProductId: PRINTIFY_PRODUCT_ID,
      quantity: 2,
    };
    const job: FulfillmentJob = { items: [item], shippingAddress: ADDRESS };
    await new PrintifyFulfillmentProvider().fulfill(job);

    const line = cap.get()!.line_items![0];
    expect(line).toEqual({ product_id: PRINTIFY_PRODUCT_ID, variant_id: 17402, quantity: 2 });
    expect(line.print_areas).toBeUndefined();
    expect(line.blueprint_id).toBeUndefined();
  });

  it("keeps the print_areas form for a designed item (regression pin)", async () => {
    const cap = stubPrintifyOrders();
    const item: ShippingQuoteItem = {
      printifyBlueprintId: 5,
      printifyPrintProviderId: 41,
      printifyVariantId: 17391,
      quantity: 1,
      sourceImageUrl: "https://blob.example.com/design.png",
      printArea: "front",
    };
    const job: FulfillmentJob = { items: [item], shippingAddress: ADDRESS };
    await new PrintifyFulfillmentProvider().fulfill(job);

    const line = cap.get()!.line_items![0];
    expect(line.print_areas).toEqual({ front: "https://blob.example.com/design.png" });
    expect(line.product_id).toBeUndefined();
  });
});

// ─── Fan-out: a referenced-Printify order dispatches by product_id/variant_id ──

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

async function seedReferencedPrintifyOrder() {
  const buyer = await seedUser();
  const seller = await seedUser();
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId: seller.id,
      sourcingMode: "REFERENCED",
      status: "ACTIVE",
      title: "Protect Our Oceans",
      retailPrice: 40,
      providerKey: "printify",
      providerProductRef: PRINTIFY_PRODUCT_ID,
      referencedVariants: {
        create: [
          { variantRef: "17402", colorName: "Black", colorHex: "#111111", sizeLabel: "M", stockLevel: 0, isOrderable: true },
        ],
      },
    },
  });
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 40, totalAmount: 60,
      shippingName: "Jane", shippingLine1: "1 St", shippingCity: "Portland",
      shippingState: "OR", shippingPostal: "97201", shippingCountry: "US",
    },
  });
  const fo = await prisma.fulfillmentOrder.create({
    data: { orderId: order.id, provider: "printify", status: "PENDING", shippingMethod: "standard", shippingCost: 19.59 },
  });
  await prisma.orderItem.create({
    data: {
      orderId: order.id, itemKind: "APPAREL", apparelListingId: listing.id,
      selection: { colorId: "Black", sizeLabel: "M" }, quantity: 1, unitPrice: 40, fulfillmentOrderId: fo.id,
    },
  });
  return { order };
}

describe("US-MFTF-17.14 — fan-out dispatches a referenced Printify order", () => {
  beforeEach(async () => { await resetDatabase(); vi.clearAllMocks(); });
  afterEach(async () => resetDatabase());

  it("orders the referenced product by { product_id, variant_id }", async () => {
    const cap = stubPrintifyOrders();
    const { order } = await seedReferencedPrintifyOrder();
    await dispatchOrderFulfillment(order.id);

    const line = cap.get()!.line_items![0];
    expect(line).toMatchObject({ product_id: PRINTIFY_PRODUCT_ID, variant_id: 17402, quantity: 1 });
    expect(line.print_areas).toBeUndefined();
  });
});

// ─── Re-sync: refreshes the cached snapshot in place (US-MFTF-13.4 pattern) ────

describe("US-MFTF-17.14 — resync a referenced Printify listing", () => {
  let sellerId: string;
  let listingId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: `s-${crypto.randomUUID()}@t.com`, roles: ["SELLER"] as never },
    });
    sellerId = seller.id;
    const listing = await prisma.apparelListing.create({
      data: {
        sellerId, sourcingMode: "REFERENCED", status: "ACTIVE", title: "Protect Our Oceans",
        retailPrice: 40, providerKey: "printify", providerProductRef: PRINTIFY_PRODUCT_ID,
      },
    });
    listingId = listing.id;
    const ingest = await ingestPrintifyProduct(PRINTIFY_PRODUCT_ID);
    if (!ingest.ok) throw new Error("seed ingest failed");
    await applyPrintifySnapshot(listingId, ingest.snapshot);
    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("re-runs the Printify ingest and refreshes the cached base price in place", async () => {
    // Printify's price changes.
    server.use(
      http.get("https://api.printify.com/v1/shops/:shop/products/:id.json", () =>
        HttpResponse.json(buildPrintifyReferencedProduct({ price: 2500 })),
      ),
    );
    const res = await resyncReferencedListingAction(listingId);
    expect("error" in res).toBe(false);

    const refreshed = await prisma.apparelListing.findUnique({ where: { id: listingId } });
    expect(Number(refreshed!.providerBasePrice)).toBe(25);
    // Rows are refreshed in place, not duplicated.
    const count = await prisma.referencedVariant.count({ where: { apparelListingId: listingId } });
    expect(count).toBe(4);
  });
});
