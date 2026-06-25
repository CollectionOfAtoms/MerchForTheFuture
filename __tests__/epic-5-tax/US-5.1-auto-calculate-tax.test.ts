import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

const { buildCartLineItems, createCartCheckout } = await import("@/lib/checkout/session");
const { createCheckoutSession } = await import("@/lib/payments/stripe");
const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
const { DEFAULT_PRODUCT_TAX_CODE, SHIPPING_TAX_CODE } = await import("@/lib/tax/codes");
import type { CheckoutPlan } from "@/lib/checkout/plan";

const ADDRESS = { name: "Jane", line1: "1 St", city: "Portland", state: "OR", postal: "97201", country: "US" };

/** Capture the Stripe checkout-session create body (form-urlencoded). */
function captureStripe(): { get: () => string } {
  let body = "";
  server.use(
    http.post("https://api.stripe.com/v1/checkout/sessions", async ({ request }) => {
      body = await request.text();
      return HttpResponse.json({ id: "cs_cart_mock", client_secret: "cs_cart_mock_secret", url: null });
    }),
  );
  return { get: () => body };
}

function useShippingHandlers() {
  server.use(
    ...["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"].map((base) =>
      http.post(`${base}/quotes`, () =>
        HttpResponse.json({
          quotes: [{ shipmentMethod: "Standard", costSummary: { shipping: { amount: "4.99", currency: "USD" } } }],
        }),
      ),
    ),
  );
}

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
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

const PLAN: CheckoutPlan = {
  status: "ok",
  removed: [],
  priceChanges: [],
  itemsSubtotal: 40,
  shippingTotal: 4.99,
  total: 44.99,
  groups: [
    {
      providerKey: "prodigi",
      shippingMethod: "Standard",
      shippingCost: 4.99,
      options: [{ method: "Standard", cost: 4.99 }],
      items: [
        {
          cartItemId: "ci1", kind: "PRINT", providerKey: "prodigi", title: "Sunrise print",
          selectionSummary: "16x24", unitPrice: 40, quantity: 1, lineTotal: 40,
          quoteItem: {} as never, apparelListingId: null, listingId: "l1", selection: {},
        },
      ],
    },
  ],
};

describe("US-5.1 — Auto-Calculate Tax by Buyer Location (Stripe Tax)", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    useShippingHandlers();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await resetDatabase();
  });

  describe("buildCartLineItems — Stripe Tax prerequisites", () => {
    it("puts a tax_behavior on every price_data and a tax_code on every product_data", () => {
      const lines = buildCartLineItems(PLAN);
      expect(lines.length).toBeGreaterThanOrEqual(2); // one item + one shipping line
      for (const line of lines) {
        expect(line.price_data.tax_behavior).toBe("exclusive");
        expect(line.price_data.product_data.tax_code).toBeTruthy();
      }
    });

    it("uses the goods tax code for items and the shipping tax code for the shipment line", () => {
      const lines = buildCartLineItems(PLAN);
      const item = lines.find((l) => l.price_data.product_data.name.startsWith("Sunrise"))!;
      const shipping = lines.find((l) => /Shipment/.test(l.price_data.product_data.name))!;
      expect(item.price_data.product_data.tax_code).toBe(DEFAULT_PRODUCT_TAX_CODE);
      expect(shipping.price_data.product_data.tax_code).toBe(SHIPPING_TAX_CODE);
    });
  });

  describe("automatic_tax flag (env-gated, default off)", () => {
    it("enables automatic_tax and requires a billing address when STRIPE_TAX_ENABLED=true", async () => {
      vi.stubEnv("STRIPE_TAX_ENABLED", "true");
      const captured = captureStripe();
      const buyer = await seedUser();
      const seller = await seedUser();
      const cart = await seedPrintCart(buyer.id, seller.id);

      await createCartCheckout(buyer.id, cart.id, ADDRESS);
      const body = decodeURIComponent(captured.get());
      expect(body).toContain("automatic_tax[enabled]=true");
      expect(body).toContain("billing_address_collection=required");
    });

    it("leaves automatic_tax off by default (no env)", async () => {
      // Explicit off — deterministic regardless of a developer's local .env.local
      // (which may set STRIPE_TAX_ENABLED=true for manual testing).
      vi.stubEnv("STRIPE_TAX_ENABLED", "");
      const captured = captureStripe();
      const buyer = await seedUser();
      const seller = await seedUser();
      const cart = await seedPrintCart(buyer.id, seller.id);

      await createCartCheckout(buyer.id, cart.id, ADDRESS);
      const body = decodeURIComponent(captured.get());
      expect(body).toContain("automatic_tax[enabled]=false");
    });
  });

  describe("legacy buy-now checkout (createCheckoutSession)", () => {
    it("wires automatic_tax (env-gated) + tax_behavior/tax_code on the line", async () => {
      vi.stubEnv("STRIPE_TAX_ENABLED", "true");
      const captured = captureStripe();
      const buyer = await seedUser();
      const seller = await seedUser();
      const artwork = await prisma.artwork.create({ data: { sellerId: seller.id, title: "Orig", description: "x", status: "PUBLISHED" } });
      const listing = await prisma.originalListing.create({ data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 250, status: "ACTIVE" } });
      const order = await prisma.order.create({
        data: { buyerId: buyer.id, listingType: "ORIGINAL", originalListingId: listing.id, subtotal: 250, taxAmount: 0, totalAmount: 250, currency: "USD" },
      });

      await createCheckoutSession(order.id);
      const body = decodeURIComponent(captured.get());
      expect(body).toContain("automatic_tax[enabled]=true");
      expect(body).toContain("tax_behavior]=exclusive");
      expect(body).toContain(DEFAULT_PRODUCT_TAX_CODE);
    });
  });

  describe("tax persistence from the Stripe session", () => {
    it("writes taxAmount/taxRate/taxJurisdiction from total_details on fulfillment", async () => {
      captureStripe();
      const buyer = await seedUser();
      const seller = await seedUser();
      const cart = await seedPrintCart(buyer.id, seller.id);
      const { orderId } = await createCartCheckout(buyer.id, cart.id, ADDRESS);
      await prisma.order.update({ where: { id: orderId }, data: { stripeSessionId: "cs_tax_paid", subtotal: 40, totalAmount: 44.99 } });

      // Stripe reports $3.60 tax (9% of the $40 item) and a $48.59 grand total.
      server.use(
        http.get("https://api.stripe.com/v1/checkout/sessions/:id", ({ params }) =>
          HttpResponse.json({
            id: params.id,
            payment_status: "paid",
            status: "complete",
            currency: "usd",
            amount_total: 4859,
            total_details: {
              amount_tax: 360,
              breakdown: {
                taxes: [
                  { amount: 360, rate: { display_name: "OR Sales Tax", jurisdiction: "OR", percentage: 9 } },
                ],
              },
            },
            metadata: { orderId },
          }),
        ),
      );

      await fulfillPaymentBySession("cs_tax_paid", orderId);

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order!.status).toBe("PAID");
      expect(Number(order!.taxAmount)).toBeCloseTo(3.6, 2);
      expect(Number(order!.totalAmount)).toBeCloseTo(48.59, 2);
      expect(order!.taxJurisdiction).toBeTruthy();
      expect(Number(order!.taxRate)).toBeGreaterThan(0);
      // Transaction gross reflects the true charged total (incl. tax).
      const tx = await prisma.transaction.findFirst({ where: { orderId } });
      expect(Number(tx!.grossAmount)).toBeCloseTo(48.59, 2);
    });
  });
});
