import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const WEBHOOK_SECRET = "test-prodigi-webhook-secret";
process.env.PRODIGI_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { POST } = await import("@/app/api/webhooks/prodigi/route");

// Prodigi does not sign callbacks — the endpoint is secured by a shared secret token
// embedded in the registered callback URL (?token=…). See the route's AUTH MODEL note.
function postEvent(event: unknown, opts: { token?: string } = {}): Promise<Response> {
  const body = JSON.stringify(event);
  const token = opts.token ?? WEBHOOK_SECRET;
  return POST(new Request(`https://example.com/api/webhooks/prodigi?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }));
}

async function seedProdigiFo(providerOrderId: string, status = "CONFIRMED") {
  const buyer = await prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
  const seller = await prisma.user.create({ data: { email: `s-${crypto.randomUUID()}@example.com`, roles: ["SELLER"] } });
  const listing = await prisma.apparelListing.create({
    data: { sellerId: seller.id, sourcingMode: "REFERENCED", title: "Tee", retailPrice: 32, status: "ACTIVE", providerKey: "teemill", providerProductRef: "ref" },
  });
  const order = await prisma.order.create({
    data: { buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 32, totalAmount: 36, shippingCountry: "US" },
  });
  const fo = await prisma.fulfillmentOrder.create({
    data: { orderId: order.id, provider: "prodigi", status: status as never, providerOrderId, shippingCost: 0 },
  });
  await prisma.orderItem.create({
    data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1, unitPrice: 32, fulfillmentOrderId: fo.id },
  });
  return fo;
}

function dispatchEvent(orderId: string) {
  return {
    type: "com.prodigi.order.shipments.shipment#Dispatched",
    data: { order: { id: orderId, shipments: [{ tracking: { number: "PG-9", carrier: "FedEx" } }] } },
  };
}

function countEmails(): { get: () => number } {
  let n = 0;
  server.use(http.post("https://api.mailersend.com/v1/email", () => { n++; return HttpResponse.json({ id: "e" }); }));
  return { get: () => n };
}

describe("US-MFTF-14.1 — Prodigi webhook endpoint & verification", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    process.env.PRODIGI_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("accepts a validly-signed dispatch event → 200 and transitions the FulfillmentOrder", async () => {
    const fo = await seedProdigiFo("ord-1");
    countEmails();
    const res = await postEvent(dispatchEvent("ord-1"));
    expect(res.status).toBe(200);
    const row = await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } });
    expect(row!.status).toBe("SHIPPED");
    expect(row!.trackingNumber).toBe("PG-9");
    expect(row!.carrier).toBe("FedEx");
  });

  it("rejects an invalid/missing token → 401 and does not process", async () => {
    const fo = await seedProdigiFo("ord-1");
    const res = await postEvent(dispatchEvent("ord-1"), { token: "wrong-token" });
    expect(res.status).toBe(401);
    expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("CONFIRMED");
  });

  it("acknowledges an unknown event type with 200 and ignores it (no transition)", async () => {
    const fo = await seedProdigiFo("ord-1");
    const unknown = { type: "com.prodigi.order.something.unhandled#Whatever", data: { order: { id: "ord-1" } } };
    const res = await postEvent(unknown);
    expect(res.status).toBe(200);
    expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("CONFIRMED");
  });

  it("is idempotent — a replayed dispatch event transitions (and emails) at most once", async () => {
    const fo = await seedProdigiFo("ord-1");
    const emails = countEmails();
    await postEvent(dispatchEvent("ord-1"));
    await postEvent(dispatchEvent("ord-1"));
    expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("SHIPPED");
    expect(emails.get()).toBe(1);
  });
});
