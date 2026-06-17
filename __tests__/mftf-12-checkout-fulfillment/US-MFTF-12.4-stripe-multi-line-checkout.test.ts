import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";
import { POWERED_BY_PLANTS_PRODUCT_REF } from "../mocks/teemill-fixture";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

const { createCartCheckout } = await import("@/lib/checkout/session");
const { fulfillPaymentBySession } = await import("@/lib/payments/webhook");
const { createCartCheckoutSessionAction } = await import("@/app/actions/checkout");
const { auth } = await import("@/auth");

function authAs(userId: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, roles: ["BUYER"] } } as never);
}
function authAsGuest() {
  vi.mocked(auth).mockResolvedValue(null as never);
}

const ADDRESS = { name: "Jane", line1: "1 St", city: "Portland", state: "OR", postal: "97201", country: "US" };

// Capture the Stripe session-create body (form-urlencoded) for assertions.
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
    http.post("https://api.teemill.com/v1/orders", () =>
      HttpResponse.json(
        { id: "t-1", fulfillments: [{ id: "f-1", availableShippingMethods: [{ id: "standard", name: "Standard", totalPrice: { amount: "3.99" } }] }] },
        { status: 201 },
      ),
    ),
  );
}

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

async function seedReferenced(sellerId: string, price = 32) {
  return prisma.apparelListing.create({
    data: {
      sellerId, sourcingMode: "REFERENCED", title: "Powered By Plants", retailPrice: price, status: "ACTIVE",
      providerKey: "teemill", providerProductRef: POWERED_BY_PLANTS_PRODUCT_REF, providerBaseCurrency: "GBP", providerBasePrice: 21,
      referencedVariants: { create: [{ variantRef: "https://api.teemill.com/v1/catalog/variants/uuid-v-evergreen-m", colorName: "Evergreen", colorHex: "#23312d", sizeLabel: "M", stockLevel: 73, isOrderable: true, mockupUrl: "x" }] },
    },
  });
}

async function seedPrint(sellerId: string, price = 40) {
  const artwork = await prisma.artwork.create({ data: { sellerId, title: "Sunrise", description: "x", status: "PUBLISHED" } });
  return prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE", availableForPrint: true, printSourceImageUrl: "https://b/p.png", printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price }] },
  });
}

async function seedMixedCart(buyerId: string, sellerId: string) {
  const ref = await seedReferenced(sellerId);
  const print = await seedPrint(sellerId);
  const cart = await prisma.cart.create({ data: { userId: buyerId } });
  await prisma.cartItem.create({ data: { cartId: cart.id, itemKind: "APPAREL", apparelListingId: ref.id, selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1 } });
  await prisma.cartItem.create({ data: { cartId: cart.id, itemKind: "PRINT", listingId: print.id, selection: { prodigiSku: "GLOBAL-FAP-16X24", attributes: {}, quotedUnitPrice: 40 }, quantity: 2 } });
  return cart;
}

describe("US-MFTF-12.4 — multi-line Stripe checkout session", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    useShippingHandlers();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  describe("createCartCheckout", () => {
    it("creates Order(CART, PENDING) + OrderItem + FulfillmentOrder rows before returning a session", async () => {
      captureStripe();
      const buyer = await seedUser();
      const seller = await seedUser();
      const cart = await seedMixedCart(buyer.id, seller.id);

      const result = await createCartCheckout(buyer.id, cart.id, ADDRESS);
      expect(result.clientSecret).toBeTruthy();
      expect(result.orderId).toBeTruthy();

      const order = await prisma.order.findUnique({
        where: { id: result.orderId },
        include: { orderItems: { include: { fulfillmentOrder: true } }, fulfillmentOrders: true },
      });
      expect(order!.listingType).toBe("CART");
      expect(order!.status).toBe("PENDING");
      expect(order!.originalListingId).toBeNull();
      expect(order!.apparelListingId).toBeNull();
      expect(order!.orderItems).toHaveLength(2);
      expect(order!.fulfillmentOrders).toHaveLength(2);
      expect(order!.fulfillmentOrders.every((f) => f.status === "PENDING")).toBe(true);
      // unitPrice captured; each item linked to a fulfillment order matching its provider.
      const printItem = order!.orderItems.find((i) => i.itemKind === "PRINT")!;
      expect(Number(printItem.unitPrice)).toBe(40);
      expect(printItem.fulfillmentOrder!.provider).toBe("prodigi");
      const apparelItem = order!.orderItems.find((i) => i.itemKind === "APPAREL")!;
      expect(apparelItem.fulfillmentOrder!.provider).toBe("teemill");
      // stripe session id stored.
      expect(order!.stripeSessionId).toBe(result.sessionId);
    });

    it("sends one Stripe line per item + one per shipment group, with Stripe Tax enabled", async () => {
      const captured = captureStripe();
      const buyer = await seedUser();
      const seller = await seedUser();
      const cart = await seedMixedCart(buyer.id, seller.id);

      await createCartCheckout(buyer.id, cart.id, ADDRESS);
      const body = decodeURIComponent(captured.get());
      expect(body).toContain("automatic_tax");
      // Item unit amounts in cents: $32 apparel, $40 print.
      expect(body).toContain("3200");
      expect(body).toContain("4000");
      // Shipping line items labeled by shipment, never by provider.
      expect(body).toContain("Shipment");
      expect(body.toLowerCase()).not.toContain("teemill");
      expect(body.toLowerCase()).not.toContain("prodigi");
    });
  });

  describe("webhook checkout.session.completed (cart order)", () => {
    it("marks the cart order PAID and empties the buyer's cart", async () => {
      captureStripe();
      const buyer = await seedUser();
      const seller = await seedUser();
      const cart = await seedMixedCart(buyer.id, seller.id);
      const { orderId } = await createCartCheckout(buyer.id, cart.id, ADDRESS);
      await prisma.order.update({ where: { id: orderId }, data: { stripeSessionId: "cs_test_mock" } });

      await fulfillPaymentBySession("cs_test_mock", orderId);

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order!.status).toBe("PAID");
      expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
      const tx = await prisma.transaction.findFirst({ where: { orderId } });
      expect(tx).not.toBeNull();
    });

    it("is idempotent for cart orders", async () => {
      captureStripe();
      const buyer = await seedUser();
      const seller = await seedUser();
      const cart = await seedMixedCart(buyer.id, seller.id);
      const { orderId } = await createCartCheckout(buyer.id, cart.id, ADDRESS);
      await prisma.order.update({ where: { id: orderId }, data: { stripeSessionId: "cs_test_mock" } });
      await fulfillPaymentBySession("cs_test_mock", orderId);
      await expect(fulfillPaymentBySession("cs_test_mock", orderId)).resolves.not.toThrow();
    });
  });

  describe("createCartCheckoutSessionAction", () => {
    it("returns Unauthorized when not signed in", async () => {
      authAsGuest();
      const result = await createCartCheckoutSessionAction(ADDRESS, { confirmed: true });
      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("requires re-confirmation when an item changed and confirmed is false (no order created)", async () => {
      captureStripe();
      const buyer = await seedUser();
      const seller = await seedUser();
      authAs(buyer.id);
      const cart = await seedMixedCart(buyer.id, seller.id);
      // Force a price drift on the print so status becomes "changed".
      const print = await prisma.originalListing.findFirst({ where: {} });
      await prisma.originalListing.update({ where: { id: print!.id }, data: { printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price: 55 }] } });

      const result = await createCartCheckoutSessionAction(ADDRESS, { confirmed: false });
      expect("requiresConfirmation" in result && result.requiresConfirmation).toBe(true);
      expect(await prisma.order.count({ where: { buyerId: buyer.id } })).toBe(0);
    });

    it("creates the session when confirmed", async () => {
      captureStripe();
      const buyer = await seedUser();
      const seller = await seedUser();
      authAs(buyer.id);
      const cart = await seedMixedCart(buyer.id, seller.id);

      const result = await createCartCheckoutSessionAction(ADDRESS, { confirmed: true });
      expect("clientSecret" in result && result.clientSecret).toBeTruthy();
      expect(await prisma.order.count({ where: { buyerId: buyer.id, listingType: "CART" } })).toBe(1);
    });
  });
});
