import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { auth } = await import("@/auth");
const { getOrderShipmentsView } = await import("@/lib/checkout/shipments");
const { applyFulfillmentTransition } = await import("@/lib/fulfillment/status");
const { markOriginalShippedAction } = await import("@/app/actions/fulfillment");
const OrderShipments = (await import("@/components/OrderShipments")).default;

function muteEmails() {
  server.use(http.post("https://api.mailersend.com/v1/email", () => HttpResponse.json({ id: "e" })));
}

async function seedUser(roles: Array<"BUYER" | "SELLER" | "ADMIN">) {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@test.com`, name: "U", passwordHash: "x", roles } });
}

/** A PAID, address-confirmed original; returns the order + its seller + buyer. */
async function seedOriginal() {
  const seller = await seedUser(["SELLER"]);
  const buyer = await seedUser(["BUYER"]);
  const artwork = await prisma.artwork.create({
    data: {
      title: "Sunrise Original", description: "x", sellerId: seller.id, status: "PUBLISHED",
      images: { create: [{ url: "https://blob.example.com/o.png", thumbnailUrl: "https://blob.example.com/t.png", isPrimary: true, order: 0 }] },
    },
  });
  const listing = await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 500, status: "SOLD" } });
  const order = await prisma.order.create({
    data: { buyerId: buyer.id, listingType: "ORIGINAL", originalListingId: listing.id, subtotal: 500, totalAmount: 500, status: "PAID", shippingName: "Jane", shippingLine1: "1 St", shippingCity: "X", shippingPostal: "1", shippingCountry: "US" },
  });
  return { seller, buyer, order };
}

/** A PAID single-shipment dropship CART order with one CONFIRMED Teemill FO. */
async function seedDropship() {
  const seller = await seedUser(["SELLER"]);
  const buyer = await seedUser(["BUYER"]);
  const listing = await prisma.apparelListing.create({
    data: { sellerId: seller.id, sourcingMode: "REFERENCED", title: "Evergreen Tee", retailPrice: 32, status: "ACTIVE", providerKey: "teemill", providerProductRef: "ref" },
  });
  const order = await prisma.order.create({
    data: { buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 32, totalAmount: 36, shippingCountry: "US" },
  });
  const fo = await prisma.fulfillmentOrder.create({ data: { orderId: order.id, provider: "teemill", status: "CONFIRMED", providerOrderId: "t-1", shippingCost: 0 } });
  await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1, unitPrice: 32, fulfillmentOrderId: fo.id } });
  return { seller, buyer, order, fo };
}

describe("US-MFTF-15.3 — buyer fulfillment page status source alignment", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    muteEmails();
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("derives original status from the seller transition and renders via the same shipments view", async () => {
    const { seller, buyer, order } = await seedOriginal();
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);

    const fd = new FormData();
    fd.set("carrier", "UPS");
    fd.set("trackingNumber", "ORIG-TRACK-1");
    await markOriginalShippedAction(order.id, fd);

    const view = await getOrderShipmentsView(order.id, buyer.id);
    expect(view).not.toBeNull();
    expect(view!.shipments).toHaveLength(1);
    expect(view!.shipments[0].status).toBe("SHIPPED");
    expect(view!.shipments[0].label).toBe("Your order");
    expect(view!.shipments[0].trackingNumber).toBe("ORIG-TRACK-1");
    expect(view!.shipments[0].carrier).toBe("UPS");
    expect(view!.shipments[0].items[0].title).toBe("Sunrise Original");
    expect(view!.aggregateStatus).toBe("Shipped");
  });

  it("never exposes the seller identity or the synthetic provider key to the buyer", async () => {
    const { seller, buyer, order } = await seedOriginal();
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
    const fd = new FormData();
    fd.set("carrier", "UPS");
    fd.set("trackingNumber", "ORIG-TRACK-1");
    await markOriginalShippedAction(order.id, fd);

    const view = await getOrderShipmentsView(order.id, buyer.id);
    const serialized = JSON.stringify(view).toLowerCase();
    expect(serialized).not.toContain("originals"); // synthetic provider key
    expect(serialized).not.toContain(seller.email.toLowerCase());
    expect(serialized).not.toContain("teemill");
    expect(serialized).not.toContain("prodigi");
  });

  it("a seller-shipped original and a webhook-shipped dropship render identical status/tracking UI", async () => {
    // Original — shipped by its seller (US-MFTF-15.1 path).
    const orig = await seedOriginal();
    vi.mocked(auth).mockResolvedValue({ user: { id: orig.seller.id, roles: ["SELLER"] } } as never);
    const fd = new FormData();
    fd.set("carrier", "UPS");
    fd.set("trackingNumber", "SHARED-TRACK");
    await markOriginalShippedAction(orig.order.id, fd);

    // Dropship — shipped by the provider webhook/poll (MFTF-14 seam).
    const drop = await seedDropship();
    await applyFulfillmentTransition(drop.fo.id, "SHIPPED", { trackingNumber: "SHARED-TRACK", carrier: "UPS" });

    const origView = await getOrderShipmentsView(orig.order.id, orig.buyer.id);
    const dropView = await getOrderShipmentsView(drop.order.id, drop.buyer.id);

    // Same buyer-facing status source: status + tracking + label are identical.
    const fields = (v: typeof origView) => ({
      status: v!.shipments[0].status,
      label: v!.shipments[0].label,
      trackingNumber: v!.shipments[0].trackingNumber,
      carrier: v!.shipments[0].carrier,
      aggregateStatus: v!.aggregateStatus,
    });
    expect(fields(origView)).toEqual(fields(dropView));

    // And the rendered status badge + tracking line are byte-identical (the only
    // difference between the two cards is the item title — not status or tracking).
    const origHtml = renderToStaticMarkup(createElement(OrderShipments, { view: origView! }));
    const dropHtml = renderToStaticMarkup(createElement(OrderShipments, { view: dropView! }));
    const badge = (html: string) => html.match(/<span class="rounded-full[^>]*>[^<]*<\/span>/)?.[0];
    const tracking = (html: string) => html.match(/<p class="mt-3 text-sm text-stone-700">.*?<\/p>/)?.[0];
    expect(badge(origHtml)).toContain(">Shipped<");
    expect(tracking(origHtml)).toContain("SHARED-TRACK");
    expect(badge(origHtml)).toEqual(badge(dropHtml));
    expect(tracking(origHtml)).toEqual(tracking(dropHtml));
  });

  it("does not re-open buyer-locked access control — another buyer cannot see the original's shipments", async () => {
    const { seller, order } = await seedOriginal();
    const stranger = await seedUser(["BUYER"]);
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
    const fd = new FormData();
    fd.set("carrier", "UPS");
    fd.set("trackingNumber", "ORIG-TRACK-1");
    await markOriginalShippedAction(order.id, fd);

    expect(await getOrderShipmentsView(order.id, stranger.id)).toBeNull();
  });
});
