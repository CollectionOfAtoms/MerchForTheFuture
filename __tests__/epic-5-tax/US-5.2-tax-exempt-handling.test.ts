import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

const { uploadTaxCertificateAction, approveTaxCertificateAction, rejectTaxCertificateAction } =
  await import("@/app/actions/tax");
const { isTaxExempt } = await import("@/lib/tax/exemption");
const { ensureBuyerStripeCustomer } = await import("@/lib/tax/customer");
const { createCartCheckout } = await import("@/lib/checkout/session");
const { auth } = await import("@/auth");

function authAs(userId: string, roles: string[] = ["BUYER"]) {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, roles } } as never);
}
function authGuest() {
  vi.mocked(auth).mockResolvedValue(null as never);
}

async function seedBuyer(extra: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { email: `b-${crypto.randomUUID()}@test.com`, name: "Buyer", roles: ["BUYER"], ...extra },
  });
}
async function seedAdmin() {
  return prisma.user.create({ data: { email: `a-${crypto.randomUUID()}@test.com`, name: "Admin", roles: ["ADMIN"] } });
}

const ADDRESS = { name: "Jane", line1: "1 St", city: "Portland", state: "OR", postal: "97201", country: "US" };

function captureStripeSession(): { get: () => string } {
  let body = "";
  server.use(
    http.post("https://api.stripe.com/v1/checkout/sessions", async ({ request }) => {
      body = await request.text();
      return HttpResponse.json({ id: "cs_cart_mock", client_secret: "cs_cart_mock_secret", url: null });
    }),
  );
  return { get: () => body };
}

function usePrint() {
  server.use(
    ...["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"].map((base) =>
      http.post(`${base}/quotes`, () =>
        HttpResponse.json({ quotes: [{ shipmentMethod: "Standard", costSummary: { shipping: { amount: "4.99", currency: "USD" } } }] }),
      ),
    ),
  );
}

async function seedPrintCart(buyerId: string, sellerId: string) {
  const artwork = await prisma.artwork.create({ data: { sellerId, title: "Sunrise", description: "x", status: "PUBLISHED" } });
  const print = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE", availableForPrint: true, printSourceImageUrl: "https://b/p.png", printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price: 40 }] },
  });
  const cart = await prisma.cart.create({ data: { userId: buyerId } });
  await prisma.cartItem.create({ data: { cartId: cart.id, itemKind: "PRINT", listingId: print.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 40 }, quantity: 1 } });
  return cart;
}

describe("US-5.2 — Tax-Exempt Handling (Stripe Customer tax_exempt)", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    usePrint();
  });
  afterEach(async () => resetDatabase());

  describe("buyer cert upload", () => {
    it("creates a PENDING certificate tied to the buyer", async () => {
      const buyer = await seedBuyer();
      authAs(buyer.id);
      const result = await uploadTaxCertificateAction("https://blob/cert.pdf", "exempt");
      expect("success" in result && result.success).toBe(true);
      const cert = await prisma.taxExemptionCertificate.findFirst({ where: { userId: buyer.id } });
      expect(cert).not.toBeNull();
      expect(cert!.status).toBe("PENDING");
      expect(cert!.fileUrl).toBe("https://blob/cert.pdf");
      expect(cert!.exemptionType).toBe("exempt");
    });

    it("rejects an unauthenticated upload", async () => {
      authGuest();
      await expect(uploadTaxCertificateAction("https://blob/cert.pdf", "exempt")).rejects.toThrow(/NEXT_REDIRECT/);
    });

    it("buyer is not exempt while the cert is only PENDING", async () => {
      const buyer = await seedBuyer();
      authAs(buyer.id);
      await uploadTaxCertificateAction("https://blob/cert.pdf", "exempt");
      expect(await isTaxExempt(buyer.id)).toBe(false);
    });
  });

  describe("admin approval", () => {
    it("forbids a non-admin from approving", async () => {
      const buyer = await seedBuyer();
      authAs(buyer.id);
      const { id } = await prisma.taxExemptionCertificate.create({ data: { userId: buyer.id, fileUrl: "u", exemptionType: "exempt" } });
      const result = await approveTaxCertificateAction(id);
      expect("error" in result).toBe(true);
    });

    it("approves, creates+persists a Stripe Customer, and sets tax_exempt via the API", async () => {
      const buyer = await seedBuyer();
      const admin = await seedAdmin();
      const cert = await prisma.taxExemptionCertificate.create({ data: { userId: buyer.id, fileUrl: "u", exemptionType: "reverse" } });

      let createCalled = false;
      let updateBody = "";
      server.use(
        http.post("https://api.stripe.com/v1/customers", async () => {
          createCalled = true;
          return HttpResponse.json({ id: "cus_new_123", object: "customer" });
        }),
        http.post("https://api.stripe.com/v1/customers/:id", async ({ request, params }) => {
          updateBody = decodeURIComponent(await request.text());
          return HttpResponse.json({ id: params.id, object: "customer" });
        }),
      );

      authAs(admin.id, ["ADMIN"]);
      const result = await approveTaxCertificateAction(cert.id);
      expect("success" in result && result.success).toBe(true);

      const updated = await prisma.taxExemptionCertificate.findUnique({ where: { id: cert.id } });
      expect(updated!.status).toBe("APPROVED");
      expect(updated!.reviewedById).toBe(admin.id);

      const fresh = await prisma.user.findUnique({ where: { id: buyer.id } });
      expect(fresh!.stripeCustomerId).toBe("cus_new_123");
      expect(createCalled).toBe(true);
      expect(updateBody).toContain("tax_exempt=reverse");
      expect(await isTaxExempt(buyer.id)).toBe(true);
    });

    it("rejects a certificate", async () => {
      const buyer = await seedBuyer();
      const admin = await seedAdmin();
      const cert = await prisma.taxExemptionCertificate.create({ data: { userId: buyer.id, fileUrl: "u", exemptionType: "exempt" } });
      authAs(admin.id, ["ADMIN"]);
      const result = await rejectTaxCertificateAction(cert.id);
      expect("success" in result && result.success).toBe(true);
      const updated = await prisma.taxExemptionCertificate.findUnique({ where: { id: cert.id } });
      expect(updated!.status).toBe("REJECTED");
      expect(await isTaxExempt(buyer.id)).toBe(false);
    });
  });

  describe("ensureBuyerStripeCustomer", () => {
    it("creates and persists a customer once, reusing it after", async () => {
      const buyer = await seedBuyer();
      const id1 = await ensureBuyerStripeCustomer(buyer.id);
      expect(id1).toBeTruthy();
      const after = await prisma.user.findUnique({ where: { id: buyer.id } });
      expect(after!.stripeCustomerId).toBe(id1);

      let createdAgain = false;
      server.use(http.post("https://api.stripe.com/v1/customers", () => { createdAgain = true; return HttpResponse.json({ id: "cus_other" }); }));
      const id2 = await ensureBuyerStripeCustomer(buyer.id);
      expect(id2).toBe(id1);
      expect(createdAgain).toBe(false);
    });
  });

  describe("checkout integration", () => {
    it("attaches the buyer's Stripe Customer to the session and records the cert on the order", async () => {
      const buyer = await seedBuyer({ stripeCustomerId: "cus_exempt_1" });
      const seller = await seedBuyer();
      const cert = await prisma.taxExemptionCertificate.create({ data: { userId: buyer.id, fileUrl: "u", exemptionType: "exempt", status: "APPROVED" } });
      const cart = await seedPrintCart(buyer.id, seller.id);
      const captured = captureStripeSession();

      const { orderId } = await createCartCheckout(buyer.id, cart.id, ADDRESS);
      const body = decodeURIComponent(captured.get());
      expect(body).toContain("customer=cus_exempt_1");

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order!.taxExemptCertId).toBe(cert.id);
    });

    it("omits the customer field when the buyer has none", async () => {
      const buyer = await seedBuyer();
      const seller = await seedBuyer();
      const cart = await seedPrintCart(buyer.id, seller.id);
      const captured = captureStripeSession();
      await createCartCheckout(buyer.id, cart.id, ADDRESS);
      const body = decodeURIComponent(captured.get());
      expect(body).not.toContain("customer=");
    });
  });
});
