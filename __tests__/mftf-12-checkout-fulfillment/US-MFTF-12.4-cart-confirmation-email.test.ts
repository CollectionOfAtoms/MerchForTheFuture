import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

const { sendCartPurchaseConfirmation } = await import("@/lib/payments/email");

/** Capture the MailerSend send (subject + html). */
function captureEmail(): { get: () => { subject?: string; html?: string } | null } {
  let payload: { subject?: string; html?: string } | null = null;
  server.use(
    http.post("https://api.mailersend.com/v1/email", async ({ request }) => {
      payload = (await request.json()) as typeof payload;
      return HttpResponse.json({ id: "e" });
    }),
  );
  return { get: () => payload };
}

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

describe("US-MFTF-12.4 — cart purchase confirmation email", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("itemizes the order with a shipping line, correct total, and a multi-line address", async () => {
    const email = captureEmail();
    const buyer = await seedUser();
    const seller = await seedUser();

    const apparel = await prisma.apparelListing.create({
      data: { sellerId: seller.id, sourcingMode: "DESIGNED", title: "Solar Punk Bee Tee", retailPrice: 35, status: "ACTIVE", designImageUrl: "https://b/d.png",
        images: { create: [{ originalUrl: "https://b/o.jpg", displayUrl: "https://b/disp.jpg", gridUrl: "https://b/grid.jpg", isPrimary: true, sortOrder: 0 }] } },
    });
    const artwork = await prisma.artwork.create({ data: { sellerId: seller.id, title: "Sunrise", description: "x", status: "PUBLISHED", images: { create: [{ url: "https://b/art.jpg", isPrimary: true, order: 0 }] } } });
    const print = await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE", availableForPrint: true, printSourceImageUrl: "https://b/p.png", printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price: 20 }] } });

    // subtotal 55 (35 + 20), shipping 17.60, total 72.60
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 55, taxAmount: 0, totalAmount: 72.6,
        shippingName: "Jesse Caldwell", shippingLine1: "5247 SE 79th Ave", shippingCity: "Portland", shippingState: "OR", shippingPostal: "97206", shippingCountry: "US",
        fulfillmentOrders: { create: [{ provider: "prodigi", shippingCost: 12.61 }, { provider: "teemill", shippingCost: 4.99 }] },
      },
    });
    await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: apparel.id, selection: { colorId: "white", sizeLabel: "M" }, quantity: 1, unitPrice: 35 } });
    await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "PRINT", listingId: print.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 20 }, quantity: 1, unitPrice: 20 } });

    await sendCartPurchaseConfirmation(order.id);

    const html = email.get()!.html!;
    // Enumerated items by name + thumbnails.
    expect(html).toContain("Solar Punk Bee Tee");
    expect(html).toContain("Sunrise");
    expect(html).toContain("https://b/grid.jpg"); // apparel thumbnail
    expect(html).toContain("https://b/art.jpg");  // print thumbnail
    // Shipping line present + the math adds up (55 + 17.60 = 72.60).
    expect(html).toContain("Shipping");
    expect(html).toContain("$17.60");
    expect(html).toContain("$55.00");
    expect(html).toContain("$72.60");
    // Multi-line shipping address (label format) — never on one comma-joined line.
    expect(html).toContain("Jesse Caldwell<br/>5247 SE 79th Ave<br/>Portland, OR 97206<br/>US");
    // No provider names leak.
    expect(html.toLowerCase()).not.toContain("teemill");
    expect(html.toLowerCase()).not.toContain("prodigi");
  });

  it("shows 'Free' shipping when all shipments are free", async () => {
    const email = captureEmail();
    const buyer = await seedUser();
    const seller = await seedUser();
    const apparel = await prisma.apparelListing.create({ data: { sellerId: seller.id, sourcingMode: "DESIGNED", title: "Tee", retailPrice: 32, status: "ACTIVE", designImageUrl: "https://b/d.png" } });
    const order = await prisma.order.create({
      data: { buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 32, taxAmount: 0, totalAmount: 32,
        shippingName: "Jane", shippingLine1: "1 St", shippingCity: "Portland", shippingState: "OR", shippingPostal: "97201", shippingCountry: "US",
        fulfillmentOrders: { create: [{ provider: "teemill", shippingCost: 0 }] } },
    });
    await prisma.orderItem.create({ data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: apparel.id, selection: { colorId: "white", sizeLabel: "M" }, quantity: 1, unitPrice: 32 } });

    await sendCartPurchaseConfirmation(order.id);
    expect(email.get()!.html!).toContain("Free");
  });
});
