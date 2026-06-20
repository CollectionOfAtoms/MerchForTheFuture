import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { POST } = await import("@/app/api/webhooks/prodigi/route");
const { dispatchOrderFulfillment } = await import("@/lib/checkout/fanout");

const PRODIGI_BASES = ["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"];

// Prodigi does not sign callbacks — the endpoint is secured by an unguessable token
// unique to each FulfillmentOrder, embedded in the per-order callback URL (?token=…)
// registered at order creation. The token both authenticates and resolves the shipment.
function postEvent(event: unknown, token: string): Promise<Response> {
  return POST(new Request(`https://example.com/api/webhooks/prodigi?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
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
  const webhookToken = `tok-${crypto.randomUUID()}`;
  const fo = await prisma.fulfillmentOrder.create({
    data: { orderId: order.id, provider: "prodigi", status: status as never, providerOrderId, webhookToken, shippingCost: 0 },
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
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("accepts an event on a valid per-order token → 200 and transitions the FulfillmentOrder", async () => {
    const fo = await seedProdigiFo("ord-1");
    countEmails();
    const res = await postEvent(dispatchEvent("ord-1"), fo.webhookToken!);
    expect(res.status).toBe(200);
    const row = await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } });
    expect(row!.status).toBe("SHIPPED");
    expect(row!.trackingNumber).toBe("PG-9");
    expect(row!.carrier).toBe("FedEx");
  });

  it("rejects an invalid/missing token → 401 and does not process", async () => {
    const fo = await seedProdigiFo("ord-1");
    const res = await postEvent(dispatchEvent("ord-1"), "wrong-token");
    expect(res.status).toBe(401);
    expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("CONFIRMED");
  });

  it("acknowledges an unknown event type with 200 and ignores it (no transition)", async () => {
    const fo = await seedProdigiFo("ord-1");
    const unknown = { type: "com.prodigi.order.something.unhandled#Whatever", data: { order: { id: "ord-1" } } };
    const res = await postEvent(unknown, fo.webhookToken!);
    expect(res.status).toBe(200);
    expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("CONFIRMED");
  });

  it("is idempotent — a replayed dispatch event transitions (and emails) at most once", async () => {
    const fo = await seedProdigiFo("ord-1");
    const emails = countEmails();
    await postEvent(dispatchEvent("ord-1"), fo.webhookToken!);
    await postEvent(dispatchEvent("ord-1"), fo.webhookToken!);
    expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("SHIPPED");
    expect(emails.get()).toBe(1);
  });

  it("fan-out mints a per-order token and registers it as the Prodigi callbackUrl; that token then drives the webhook end-to-end", async () => {
    const buyer = await prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
    const seller = await prisma.user.create({ data: { email: `s-${crypto.randomUUID()}@example.com`, roles: ["SELLER"] } });
    const artwork = await prisma.artwork.create({ data: { sellerId: seller.id, title: "Sunrise", description: "x", status: "PUBLISHED" } });
    const print = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE", availableForPrint: true, printSourceImageUrl: "https://b/p.png" },
    });
    const order = await prisma.order.create({
      data: { buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 40, totalAmount: 45, shippingName: "A", shippingLine1: "1 St", shippingCity: "NYC", shippingPostal: "10001", shippingCountry: "US" },
    });
    const fo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "prodigi", status: "PENDING", shippingCost: 4.99 } });
    await prisma.orderItem.create({
      data: { orderId: order.id, itemKind: "PRINT", listingId: print.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 40 }, quantity: 1, unitPrice: 40, fulfillmentOrderId: fo.id },
    });

    // Capture the order body Prodigi receives at creation.
    let captured: { callbackUrl?: string } | null = null;
    server.use(...PRODIGI_BASES.map((b) => http.post(`${b}/orders`, async ({ request }) => {
      captured = (await request.json()) as { callbackUrl?: string };
      return HttpResponse.json({ outcome: "Created", order: { id: "ord-new", status: { stage: "InProgress" } } });
    })));

    await dispatchOrderFulfillment(order.id);

    const placed = await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } });
    expect(placed!.webhookToken).toBeTruthy();
    expect(placed!.status).toBe("CONFIRMED");
    expect(placed!.providerOrderId).toBe("ord-new");
    expect(captured!.callbackUrl).toContain(`/api/webhooks/prodigi?token=${placed!.webhookToken}`);

    // The registered token authenticates a real callback to that exact shipment.
    countEmails();
    const res = await postEvent(dispatchEvent("ord-new"), placed!.webhookToken!);
    expect(res.status).toBe(200);
    expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("SHIPPED");
  });
});
