import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { prisma, resetDatabase } from "../helpers/db";

// DROPSHIPPING_SIMULATE_ORDERS — a dev safety switch that short-circuits order
// SUBMISSION to sandbox-less providers (Printify, Teemill) so no real external order
// is created; the shipment is advanced as if the provider confirmed it. Prodigi is
// unaffected (it has a sandbox). Requested after two accidental live-order attempts.

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { PrintifyFulfillmentProvider, ProdigiFulfillmentProvider } = await import("@/lib/fulfillment");
const { SIMULATED_ORDER_PREFIX } = await import("@/lib/fulfillment/types");
const { checkAndSyncShipments } = await import("@/lib/checkout/shipments");

import type { FulfillmentJob } from "@/lib/fulfillment/types";

const ADDRESS = { name: "Jane", line1: "1 St", city: "Portland", state: "OR", postal: "97201", country: "US" };
const PRINTIFY_JOB: FulfillmentJob = {
  items: [{ printifyBlueprintId: 5, printifyPrintProviderId: 41, printifyVariantId: 17391, quantity: 1, sourceImageUrl: "https://blob/d.png", printArea: "front" }],
  shippingAddress: ADDRESS,
};
const PRODIGI_JOB: FulfillmentJob = {
  items: [{ sku: "GLOBAL-FAP-16X24", quantity: 1, sourceImageUrl: "https://blob/p.png" }],
  shippingAddress: ADDRESS,
};

const savedFlag = process.env.DROPSHIPPING_SIMULATE_ORDERS;
function setFlag(on: boolean) {
  if (on) process.env.DROPSHIPPING_SIMULATE_ORDERS = "1";
  else delete process.env.DROPSHIPPING_SIMULATE_ORDERS;
}

describe("DROPSHIPPING_SIMULATE_ORDERS — order submission", () => {
  afterEach(() => {
    if (savedFlag === undefined) delete process.env.DROPSHIPPING_SIMULATE_ORDERS;
    else process.env.DROPSHIPPING_SIMULATE_ORDERS = savedFlag;
  });

  it("simulates a sandbox-less provider (Printify): no order API call, synthetic id", async () => {
    setFlag(true);
    let orderHits = 0;
    server.use(
      http.post("https://api.printify.com/v1/shops/:shop/orders.json", () => {
        orderHits++;
        return HttpResponse.json({ id: "SHOULD-NOT-BE-USED" });
      }),
    );
    const res = await new PrintifyFulfillmentProvider().fulfill(PRINTIFY_JOB);
    expect(res.externalOrderId.startsWith(SIMULATED_ORDER_PREFIX)).toBe(true);
    expect(res.providerMetadata).toMatchObject({ simulated: true });
    expect(orderHits).toBe(0); // the real Printify order endpoint was NOT called
  });

  it("does NOT simulate when the flag is off — the real API is called", async () => {
    setFlag(false);
    let orderHits = 0;
    server.use(
      http.post("https://api.printify.com/v1/shops/:shop/orders.json", () => {
        orderHits++;
        return HttpResponse.json({ id: "real-1", status: "pending" });
      }),
      http.post("https://api.printify.com/v1/shops/:shop/orders/:id/send-to-production.json", () =>
        HttpResponse.json({ id: "real-1", status: "in-production" }),
      ),
    );
    const res = await new PrintifyFulfillmentProvider().fulfill(PRINTIFY_JOB);
    expect(res.externalOrderId).toBe("real-1");
    expect(orderHits).toBe(1);
  });

  it("does NOT simulate Prodigi (it has a sandbox) even with the flag on", async () => {
    setFlag(true);
    let orderHits = 0;
    server.use(
      ...["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"].map((base) =>
        http.post(`${base}/orders`, () => {
          orderHits++;
          return HttpResponse.json({ order: { id: "prodigi-1" } });
        }),
      ),
    );
    const res = await new ProdigiFulfillmentProvider().fulfill(PRODIGI_JOB);
    expect(res.externalOrderId).toBe("prodigi-1");
    expect(orderHits).toBe(1);
  });
});

describe("DROPSHIPPING_SIMULATE_ORDERS — status reconciliation skips simulated orders", () => {
  beforeEach(async () => resetDatabase());
  afterEach(async () => resetDatabase());

  it("the reconciliation cron does not poll a SIMULATED order", async () => {
    const buyer = await prisma.user.create({ data: { email: `b-${crypto.randomUUID()}@t.com`, roles: ["BUYER"] } });
    const order = await prisma.order.create({
      data: { buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 30, totalAmount: 35,
        shippingName: "Jane", shippingLine1: "1 St", shippingCity: "Portland", shippingState: "OR", shippingPostal: "97201", shippingCountry: "US" },
    });
    // A simulated Printify shipment + a real Prodigi shipment, both CONFIRMED.
    await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "printify", status: "CONFIRMED", providerOrderId: `${SIMULATED_ORDER_PREFIX}printify-abc` } });
    await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "prodigi", status: "CONFIRMED", providerOrderId: "prodigi-real-1" } });

    const result = await checkAndSyncShipments();
    // Only the real (non-simulated) shipment is polled.
    expect(result.checked).toBe(1);
  });
});
