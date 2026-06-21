import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { sendSellerSaleNotificationEmail } = await import("@/lib/payments/email");
const { fulfillPayment } = await import("@/lib/payments/webhook");

/** Capture every MailerSend send (subject + html + recipient) in the current test. */
function captureEmails(): { sends: Array<{ subject: string; html: string; to: string }> } {
  const sends: Array<{ subject: string; html: string; to: string }> = [];
  server.use(
    http.post("https://api.mailersend.com/v1/email", async ({ request }) => {
      const body = (await request.json()) as { subject: string; html: string; to: Array<{ email: string }> };
      sends.push({ subject: body.subject, html: body.html, to: body.to[0]?.email });
      return HttpResponse.json({ id: "e" });
    }),
  );
  return { sends };
}

/** A PAID, address-confirmed ORIGINAL order with an artwork image. */
async function seedOriginalSale(opts: { status?: "PAID" | "PENDING"; piId?: string } = {}) {
  const seller = await prisma.user.create({ data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Selma Seller", passwordHash: "x", roles: ["SELLER"] } });
  const buyer = await prisma.user.create({ data: { email: `buyer-${crypto.randomUUID()}@test.com`, name: "Barry Buyer", passwordHash: "x", roles: ["BUYER"] } });
  const artwork = await prisma.artwork.create({
    data: {
      title: "Sunrise Over Hope Valley",
      description: "d",
      sellerId: seller.id,
      status: "PUBLISHED",
      images: { create: [{ url: "https://blob.example.com/orig.png", thumbnailUrl: "https://blob.example.com/thumb.png", isPrimary: true, order: 0 }] },
    },
  });
  const listing = await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 500, status: "ACTIVE" } });
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      listingType: "ORIGINAL",
      originalListingId: listing.id,
      subtotal: 500,
      totalAmount: 500,
      status: opts.status ?? "PAID",
      stripePaymentIntentId: opts.piId,
      shippingName: "Barry Buyer",
      shippingLine1: "42 Galaxy Way",
      shippingLine2: "Apt 7",
      shippingCity: "Portland",
      shippingState: "OR",
      shippingPostal: "97201",
      shippingCountry: "US",
    },
  });
  return { seller, buyer, artwork, order };
}

describe("US-MFTF-15.4 — seller sale notification email", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("emails the SELLER with the artwork + thumbnail, ship-to address, and a tracking link", async () => {
    const { seller, order } = await seedOriginalSale();
    const { sends } = captureEmails();

    await sendSellerSaleNotificationEmail(order.id);

    expect(sends).toHaveLength(1);
    const email = sends[0];
    expect(email.to).toBe(seller.email); // seller, not buyer
    expect(email.subject).toContain("Sunrise Over Hope Valley");
    // Thumbnail (our-domain image).
    expect(email.html).toContain("https://blob.example.com/thumb.png");
    // Ship-to name + address.
    expect(email.html).toContain("Barry Buyer");
    expect(email.html).toContain("42 Galaxy Way");
    expect(email.html).toContain("Portland");
    expect(email.html).toContain("97201");
    // Link to the seller fulfillment page to enter tracking.
    expect(email.html).toContain("/seller/fulfillment");
  });

  it("does not email the buyer's address to anyone but the seller", async () => {
    const { seller, buyer, order } = await seedOriginalSale();
    const { sends } = captureEmails();
    await sendSellerSaleNotificationEmail(order.id);
    expect(sends.every((s) => s.to === seller.email)).toBe(true);
    expect(sends.some((s) => s.to === buyer.email)).toBe(false);
  });

  it("is a no-op for non-original orders", async () => {
    const buyer = await prisma.user.create({ data: { email: `b-${crypto.randomUUID()}@test.com`, roles: ["BUYER"] } });
    const order = await prisma.order.create({
      data: { buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 32, totalAmount: 36, shippingCountry: "US" },
    });
    const { sends } = captureEmails();
    await sendSellerSaleNotificationEmail(order.id);
    expect(sends).toHaveLength(0);
  });

  it("fires from the PAID transition (fulfillPayment) — the seller is notified on purchase", async () => {
    const { seller, order } = await seedOriginalSale({ status: "PENDING", piId: "pi_seller_sale_1" });
    const { sends } = captureEmails();

    await fulfillPayment("pi_seller_sale_1");

    // The buyer purchase confirmation also sends; assert the seller sale email is among them.
    const sellerEmail = sends.find((s) => s.to === seller.email && /time to ship/i.test(s.subject));
    expect(sellerEmail).toBeTruthy();
    expect(sellerEmail!.html).toContain("/seller/fulfillment");

    const paid = await prisma.order.findUnique({ where: { id: order.id } });
    expect(paid!.status).toBe("PAID");
  });
});
