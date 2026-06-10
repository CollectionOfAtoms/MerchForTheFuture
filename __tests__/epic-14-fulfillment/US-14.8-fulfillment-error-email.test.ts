import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { confirmShippingAction } = await import("@/app/actions/fulfillment");
const { auth } = await import("@/auth");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRODIGI_BASES = [
  "https://api.prodigi.com/v4.0",
  "https://api.sandbox.prodigi.com/v4.0",
];

function makeShippingForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name",    overrides.name    ?? "Jane Buyer");
  fd.set("line1",   overrides.line1   ?? "123 Main St");
  fd.set("city",    overrides.city    ?? "Portland");
  fd.set("postal",  overrides.postal  ?? "97201");
  fd.set("country", overrides.country ?? "US");
  return fd;
}

// ─── US-14.8 — Fulfillment Error Email ────────────────────────────────────────

describe("US-14.8 — Fulfillment Error Email Notification", () => {
  let buyerId: string;
  let sellerId: string;
  let orderId: string;

  beforeEach(async () => {
    await resetDatabase();

    const seller = await prisma.user.create({
      data: { email: "seller148@test.com", name: "Test Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    sellerId = seller.id;

    const buyer = await prisma.user.create({
      data: { email: "buyer148@test.com", name: "Test Buyer", passwordHash: "x", roles: ["BUYER"] },
    });
    buyerId = buyer.id;

    const artwork = await prisma.artwork.create({
      data: { title: "Test Print", description: "A test print", sellerId, status: "PUBLISHED" },
    });
    const listing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        currency: "USD",
        status: "ACTIVE",
        availableForPrint: true,
        printSourceImageUrl: "https://blob.example.com/source.png",
      },
    });
    const order = await prisma.order.create({
      data: {
        buyerId,
        listingType: "PRINT",
        originalListingId: listing.id,
        prodigiSku: "GLOBAL-FAP-16X24",
        printSize: "16x24",
        quantity: 1,
        subtotal: 50,
        totalAmount: 50,
        status: "PAID",
      },
    });
    orderId = order.id;

    vi.mocked(auth).mockResolvedValue({ user: { id: buyerId, roles: ["BUYER"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  // ── Email is sent on Prodigi failure ─────────────────────────────────────────

  it("sends an email to the seller when the Prodigi API returns an error", async () => {
    // Force Prodigi to return 401 for this test
    server.use(
      ...PRODIGI_BASES.map((base) =>
        http.post(`${base}/orders`, () => HttpResponse.json({ message: "Unauthorized" }, { status: 401 }))
      )
    );

    const emailsSent: { to: string; subject: string }[] = [];
    server.use(
      http.post("https://api.mailersend.com/v1/email", async ({ request }) => {
        const body = await request.json() as { to: { email: string }[]; subject: string };
        emailsSent.push({ to: body.to[0].email, subject: body.subject });
        return HttpResponse.json({}, { status: 202 });
      })
    );

    await confirmShippingAction(orderId, makeShippingForm());

    const fulfillmentEmails = emailsSent.filter((e) => /fulfillment|action required/i.test(e.subject));
    expect(fulfillmentEmails).toHaveLength(1);
    expect(fulfillmentEmails[0].to).toBe("seller148@test.com");
  });

  it("addresses the fulfillment error email to the seller, not the buyer", async () => {
    server.use(
      ...PRODIGI_BASES.map((base) =>
        http.post(`${base}/orders`, () => HttpResponse.json({}, { status: 500 }))
      )
    );

    const emails: { to: string; subject: string }[] = [];
    server.use(
      http.post("https://api.mailersend.com/v1/email", async ({ request }) => {
        const body = await request.json() as { to: { email: string }[]; subject: string };
        emails.push({ to: body.to[0].email, subject: body.subject });
        return HttpResponse.json({}, { status: 202 });
      })
    );

    await confirmShippingAction(orderId, makeShippingForm());

    // The fulfillment error notification must go to the seller
    const errorEmail = emails.find((e) => /action required|fulfillment error/i.test(e.subject));
    expect(errorEmail).toBeDefined();
    expect(errorEmail!.to).toBe("seller148@test.com");
    expect(errorEmail!.to).not.toBe("buyer148@test.com");
  });

  it("includes the error reason in the fulfillment error email body", async () => {
    server.use(
      ...PRODIGI_BASES.map((base) =>
        http.post(`${base}/orders`, () => HttpResponse.json({}, { status: 401 }))
      )
    );

    const emailBodies: string[] = [];
    server.use(
      http.post("https://api.mailersend.com/v1/email", async ({ request }) => {
        const body = await request.json() as { html: string };
        emailBodies.push(body.html);
        return HttpResponse.json({}, { status: 202 });
      })
    );

    await confirmShippingAction(orderId, makeShippingForm());

    const errorEmail = emailBodies.find((html) => /action required|fulfillment/i.test(html));
    expect(errorEmail).toBeDefined();
    expect(errorEmail).toMatch(/401/);
  });

  it("includes the order reference in the fulfillment error email", async () => {
    server.use(
      ...PRODIGI_BASES.map((base) =>
        http.post(`${base}/orders`, () => HttpResponse.json({}, { status: 401 }))
      )
    );

    const emailBodies: string[] = [];
    server.use(
      http.post("https://api.mailersend.com/v1/email", async ({ request }) => {
        const body = await request.json() as { html: string };
        emailBodies.push(body.html);
        return HttpResponse.json({}, { status: 202 });
      })
    );

    await confirmShippingAction(orderId, makeShippingForm());

    const orderRef = orderId.slice(-8).toUpperCase();
    const errorEmail = emailBodies.find((html) => /action required|fulfillment/i.test(html));
    expect(errorEmail).toBeDefined();
    expect(errorEmail).toContain(orderRef);
  });

  it("still returns success to the buyer even when Prodigi fails", async () => {
    server.use(
      ...PRODIGI_BASES.map((base) =>
        http.post(`${base}/orders`, () => HttpResponse.json({}, { status: 503 }))
      )
    );

    const result = await confirmShippingAction(orderId, makeShippingForm());

    expect(result).toEqual({ success: true });
  });

  it("does not send a fulfillment error email when Prodigi succeeds", async () => {
    // Global MSW handlers already return 200 for Prodigi — no override needed

    const emailsSent: string[] = [];
    server.use(
      http.post("https://api.mailersend.com/v1/email", async ({ request }) => {
        const body = await request.json() as { subject: string };
        emailsSent.push(body.subject);
        return HttpResponse.json({}, { status: 202 });
      })
    );

    await confirmShippingAction(orderId, makeShippingForm());

    const errorEmails = emailsSent.filter((s) => /action required|fulfillment error/i.test(s));
    expect(errorEmails).toHaveLength(0);
  });

  it("does not send a fulfillment error email for non-print orders", async () => {
    // Create an ORIGINAL (non-print) order that is PENDING
    const order2 = await prisma.order.create({
      data: {
        buyerId,
        listingType: "ORIGINAL",
        subtotal: 500,
        totalAmount: 500,
        status: "PENDING",
        paymentDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    const emailSubjects: string[] = [];
    server.use(
      http.post("https://api.mailersend.com/v1/email", async ({ request }) => {
        const body = await request.json() as { subject: string };
        emailSubjects.push(body.subject);
        return HttpResponse.json({}, { status: 202 });
      })
    );

    await confirmShippingAction(order2.id, makeShippingForm());

    const errorEmails = emailSubjects.filter((s) => /action required|fulfillment error/i.test(s));
    expect(errorEmails).toHaveLength(0);
  });
});
