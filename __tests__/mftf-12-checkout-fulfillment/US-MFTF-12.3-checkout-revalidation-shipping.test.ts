import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";
import { buildPoweredByPlantsCatalog, POWERED_BY_PLANTS_PRODUCT_REF } from "../mocks/teemill-fixture";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

const { revalidateCheckout } = await import("@/lib/checkout/revalidate");
const { buildCheckoutSummary } = await import("@/lib/checkout/summary");
const { createCheckoutAction } = await import("@/app/actions/checkout");
const { auth } = await import("@/auth");

function authAs(userId: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, email: `${userId}@example.com`, roles: ["BUYER"] } } as never);
}
function authAsGuest() {
  vi.mocked(auth).mockResolvedValue(null as never);
}

import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";

const ADDRESS: FulfillmentShippingAddress = {
  name: "Jane Buyer",
  line1: "1 Test St",
  city: "Portland",
  state: "OR",
  postal: "97201",
  country: "US",
};

// ─── Seeders ──────────────────────────────────────────────────────────────────

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

/** Designed apparel listing routed to a given fulfillment provider via ProductType. */
type ListingStatusLiteral = "ACTIVE" | "ARCHIVED" | "UNLISTED" | "SOLD";

async function seedDesignedListing(
  sellerId: string,
  {
    provider = "PRODIGI",
    colors = ["White"],
    sizes = ["M"],
    price = 28,
    status = "ACTIVE",
  }: { provider?: string; colors?: string[]; sizes?: string[]; price?: number; status?: ListingStatusLiteral } = {},
) {
  const productType = await prisma.productType.create({
    data: {
      name: `Tee-${crypto.randomUUID()}`,
      fulfillmentProvider: provider as "PRODIGI" | "TEEMILL",
      providerSkuBase: "RNA1",
      colors: { create: colors.map((c) => ({ colorName: c, providerColorCode: c })) },
      sizes: { create: sizes.map((s, i) => ({ sizeLabel: s, providerSizeCode: s, sortOrder: i })) },
    },
    include: { colors: true },
  });
  return prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "DESIGNED",
      productTypeId: productType.id,
      title: "Solar Punk Bee Tee",
      retailPrice: price,
      status,
      colors: { create: productType.colors.map((c) => ({ productTypeColorId: c.id, isOffered: true })) },
    },
  });
}

/** Referenced (Teemill) listing whose variants mirror the MSW fixture. */
async function seedReferencedListing(
  sellerId: string,
  { colors = ["Evergreen"], sizes = ["M"], price = 32, status = "ACTIVE" as const } = {},
) {
  return prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      title: "Powered By Plants",
      retailPrice: price,
      status,
      providerKey: "teemill",
      providerProductRef: POWERED_BY_PLANTS_PRODUCT_REF,
      providerBaseCurrency: "GBP",
      providerBasePrice: 21,
      referencedVariants: {
        create: colors.flatMap((c) =>
          sizes.map((s) => ({
            variantRef: `https://api.teemill.com/v1/catalog/variants/uuid-v-${c.toLowerCase()}-${s.toLowerCase()}`,
            colorName: c,
            colorHex: "#23312d",
            sizeLabel: s,
            stockLevel: 73,
            isOrderable: true,
            mockupUrl: "https://images.podos.io/mock-evergreen.jpg",
          })),
        ),
      },
    },
  });
}

async function seedPrintListing(sellerId: string, { sku = "GLOBAL-FAP-16X24", price = 40, availableForPrint = true, status = "ACTIVE" as const } = {}) {
  const artwork = await prisma.artwork.create({
    data: { sellerId, title: "Sunrise", description: "An original.", status: "PUBLISHED" },
  });
  return prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: "FIXED_PRICE",
      price: 100,
      status,
      availableForPrint,
      printSourceImageUrl: "https://blob.example.com/print.png",
      printProducts: [{ sku, size: "16x24", price }],
    },
  });
}

async function userCart(userId: string) {
  return prisma.cart.create({ data: { userId } });
}

async function addApparel(cartId: string, apparelListingId: string, selection: { colorId: string; sizeLabel: string }, quantity = 1) {
  return prisma.cartItem.create({ data: { cartId, itemKind: "APPAREL", apparelListingId, selection, quantity } });
}

async function addPrint(cartId: string, listingId: string, sku: string, quotedUnitPrice: number, quantity = 1) {
  return prisma.cartItem.create({
    data: { cartId, itemKind: "PRINT", listingId, selection: { prodigiSku: sku, attributes: {}, quotedUnitPrice }, quantity },
  });
}

// Prodigi quote handler (USD) + Teemill step-1 order (GBP shipping methods) for shipping quotes.
function useShippingHandlers() {
  server.use(
    ...["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"].map((base) =>
      http.post(`${base}/quotes`, () =>
        HttpResponse.json({
          quotes: [
            {
              shipmentMethod: "Standard",
              costSummary: { items: { amount: "0.00", currency: "USD" }, shipping: { amount: "4.99", currency: "USD" } },
            },
          ],
        }),
      ),
    ),
    http.post("https://api.teemill.com/v1/orders", () =>
      HttpResponse.json(
        {
          id: "teemill-quote-order-1",
          fulfillments: [
            {
              id: "ful-1",
              availableShippingMethods: [
                { id: "standard", name: "Standard", totalPrice: { amount: "3.99" } },
                { id: "express", name: "Express", totalPrice: { amount: "7.99" } },
              ],
            },
          ],
        },
        { status: 201 },
      ),
    ),
  );
}

describe("US-MFTF-12.3 — checkout revalidation & per-provider shipping", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  describe("revalidation removes stale items with reasons", () => {
    it("removes a deactivated designed listing with a human-readable reason", async () => {
      const seller = await seedUser();
      const buyer = await seedUser();
      const listing = await seedDesignedListing(seller.id, { status: "ARCHIVED" });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, listing.id, { colorId: "White", sizeLabel: "M" });

      const result = await revalidateCheckout(cart.id);
      expect(result.kept).toHaveLength(0);
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].reason).toMatch(/no longer available/i);
      expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
    });

    it("removes an apparel item whose colour is no longer offered", async () => {
      const seller = await seedUser();
      const buyer = await seedUser();
      const listing = await seedDesignedListing(seller.id, { colors: ["White"] });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, listing.id, { colorId: "Moss", sizeLabel: "M" });

      const result = await revalidateCheckout(cart.id);
      expect(result.kept).toHaveLength(0);
      expect(result.removed[0].reason).toMatch(/Moss/);
    });

    it("removes a referenced item that is out of stock on live re-read", async () => {
      server.use(
        http.get("https://api.teemill.com/v1/catalog/products", () =>
          HttpResponse.json(buildPoweredByPlantsCatalog({ forceStock: 0 })),
        ),
      );
      const seller = await seedUser();
      const buyer = await seedUser();
      const listing = await seedReferencedListing(seller.id, { colors: ["Evergreen"], sizes: ["M"] });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, listing.id, { colorId: "Evergreen", sizeLabel: "M" });

      const result = await revalidateCheckout(cart.id);
      expect(result.kept).toHaveLength(0);
      expect(result.removed[0].reason).toMatch(/out of stock/i);
    });

    it("removes a referenced item whose cached variant is not orderable", async () => {
      const seller = await seedUser();
      const buyer = await seedUser();
      const listing = await seedReferencedListing(seller.id, { colors: ["Evergreen"], sizes: ["M"] });
      // Mark the cached variant not orderable.
      await prisma.referencedVariant.updateMany({ where: { apparelListingId: listing.id }, data: { isOrderable: false } });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, listing.id, { colorId: "Evergreen", sizeLabel: "M" });

      const result = await revalidateCheckout(cart.id);
      expect(result.kept).toHaveLength(0);
      expect(result.removed[0].reason).toMatch(/no longer available/i);
    });

    it("detects print price drift (current seller price ≠ snapshot)", async () => {
      const seller = await seedUser();
      const buyer = await seedUser();
      const listing = await seedPrintListing(seller.id, { price: 45 });
      const cart = await userCart(buyer.id);
      await addPrint(cart.id, listing.id, "GLOBAL-FAP-16X24", 40); // snapshot 40, current 45

      const result = await revalidateCheckout(cart.id);
      expect(result.kept).toHaveLength(1);
      expect(result.kept[0].unitPrice).toBe(45);
      expect(result.priceChanges).toHaveLength(1);
      expect(result.priceChanges[0]).toMatchObject({ from: 40, to: 45 });
    });

    it("keeps a valid in-stock referenced item with its USD retail price", async () => {
      const seller = await seedUser();
      const buyer = await seedUser();
      const listing = await seedReferencedListing(seller.id, { colors: ["Evergreen"], sizes: ["M"], price: 32 });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, listing.id, { colorId: "Evergreen", sizeLabel: "M" });

      const result = await revalidateCheckout(cart.id);
      expect(result.kept).toHaveLength(1);
      expect(result.kept[0].unitPrice).toBe(32);
      expect(result.removed).toHaveLength(0);
    });
  });

  describe("buildCheckoutSummary groups by provider and quotes shipping", () => {
    it("groups a referenced + print cart into two shipments with summed shipping", async () => {
      useShippingHandlers();
      const seller = await seedUser();
      const buyer = await seedUser();
      const ref = await seedReferencedListing(seller.id, { colors: ["Evergreen"], sizes: ["M"] });
      const print = await seedPrintListing(seller.id, { price: 40 });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, ref.id, { colorId: "Evergreen", sizeLabel: "M" });
      await addPrint(cart.id, print.id, "GLOBAL-FAP-16X24", 40);

      const summary = await buildCheckoutSummary(cart.id, ADDRESS);
      expect(summary.status).toBe("ok");
      expect(summary.groups).toHaveLength(2);
      // Teemill £3.99 → USD via mock rate (GBP→USD = 1.0) = 3.99; Prodigi $4.99.
      expect(summary.shippingTotal).toBeCloseTo(8.98, 2);
      expect(summary.itemsSubtotal).toBeCloseTo(72, 2);
      expect(summary.total).toBeCloseTo(80.98, 2);
    });

    it("labels shipments 'Shipment N' and never exposes provider names", async () => {
      useShippingHandlers();
      const seller = await seedUser();
      const buyer = await seedUser();
      const ref = await seedReferencedListing(seller.id, { colors: ["Evergreen"], sizes: ["M"] });
      const print = await seedPrintListing(seller.id, { price: 40 });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, ref.id, { colorId: "Evergreen", sizeLabel: "M" });
      await addPrint(cart.id, print.id, "GLOBAL-FAP-16X24", 40);

      const summary = await buildCheckoutSummary(cart.id, ADDRESS);
      const labels = summary.groups.map((g) => g.label);
      expect(labels).toEqual(["Shipment 1", "Shipment 2"]);
      const serialized = JSON.stringify(summary).toLowerCase();
      expect(serialized).not.toContain("teemill");
      expect(serialized).not.toContain("prodigi");
    });

    it("merges two same-provider items (designed Prodigi + print) into one shipment", async () => {
      useShippingHandlers();
      const seller = await seedUser();
      const buyer = await seedUser();
      const designed = await seedDesignedListing(seller.id, { provider: "PRODIGI", colors: ["White"], sizes: ["M"], price: 28 });
      const print = await seedPrintListing(seller.id, { price: 40 });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, designed.id, { colorId: "White", sizeLabel: "M" });
      await addPrint(cart.id, print.id, "GLOBAL-FAP-16X24", 40);

      const summary = await buildCheckoutSummary(cart.id, ADDRESS);
      expect(summary.groups).toHaveLength(1);
      expect(summary.groups[0].items).toHaveLength(2);
    });

    it("returns status 'changed' when an item was removed", async () => {
      useShippingHandlers();
      const seller = await seedUser();
      const buyer = await seedUser();
      const ref = await seedReferencedListing(seller.id, { colors: ["Evergreen"], sizes: ["M"] });
      const dead = await seedDesignedListing(seller.id, { status: "ARCHIVED" });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, ref.id, { colorId: "Evergreen", sizeLabel: "M" });
      await addApparel(cart.id, dead.id, { colorId: "White", sizeLabel: "M" });

      const summary = await buildCheckoutSummary(cart.id, ADDRESS);
      expect(summary.status).toBe("changed");
      expect(summary.removed).toHaveLength(1);
    });
  });

  describe("createCheckoutAction", () => {
    it("returns Unauthorized when not signed in", async () => {
      authAsGuest();
      const result = await createCheckoutAction(ADDRESS);
      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("rejects an incomplete shipping address", async () => {
      const buyer = await seedUser();
      authAs(buyer.id);
      const result = await createCheckoutAction({ ...ADDRESS, line1: "" });
      expect(result).toMatchObject({ error: expect.stringMatching(/shipping address/i) });
    });

    it("reports an empty cart", async () => {
      const buyer = await seedUser();
      authAs(buyer.id);
      const result = await createCheckoutAction(ADDRESS);
      expect(result).toEqual({ error: "Your cart is empty." });
    });

    it("returns a checkout summary for a valid cart", async () => {
      useShippingHandlers();
      const seller = await seedUser();
      const buyer = await seedUser();
      authAs(buyer.id);
      const ref = await seedReferencedListing(seller.id, { colors: ["Evergreen"], sizes: ["M"] });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, ref.id, { colorId: "Evergreen", sizeLabel: "M" });

      const result = await createCheckoutAction(ADDRESS);
      expect("summary" in result).toBe(true);
      if ("summary" in result) {
        expect(result.summary.status).toBe("ok");
        expect(result.summary.groups).toHaveLength(1);
      }
    });

    it("sends a non-empty contact email in the Teemill quote (avoids the 400)", async () => {
      let body: { contactInformation?: { email?: string } } | null = null;
      server.use(
        http.post("https://api.teemill.com/v1/orders", async ({ request }) => {
          body = (await request.json()) as typeof body;
          return HttpResponse.json(
            { id: "t-1", fulfillments: [{ id: "f-1", availableShippingMethods: [{ id: "standard", name: "Standard", totalPrice: { amount: "3.99" } }] }] },
            { status: 201 },
          );
        }),
      );
      const seller = await seedUser();
      const buyer = await seedUser();
      authAs(buyer.id);
      const ref = await seedReferencedListing(seller.id, { colors: ["Evergreen"], sizes: ["M"] });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, ref.id, { colorId: "Evergreen", sizeLabel: "M" });

      await createCheckoutAction(ADDRESS);
      expect(body!.contactInformation?.email).toBeTruthy();
      expect(body!.contactInformation!.email).toContain("@");
      // The authenticated buyer's own email is threaded into the quote.
      expect(body!.contactInformation!.email).toBe(`${buyer.id}@example.com`);
    });

    it("returns a friendly error (does not throw) when Teemill rejects the quote with a 400", async () => {
      server.use(
        ...["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"].map((base) =>
          http.post(`${base}/quotes`, () => HttpResponse.json({ quotes: [{ shipmentMethod: "Standard", costSummary: { shipping: { amount: "4.99", currency: "USD" } } }] })),
        ),
        http.post("https://api.teemill.com/v1/orders", () =>
          HttpResponse.json({ message: "Invalid contact email." }, { status: 400 }),
        ),
      );
      const seller = await seedUser();
      const buyer = await seedUser();
      authAs(buyer.id);
      const ref = await seedReferencedListing(seller.id, { colors: ["Evergreen"], sizes: ["M"] });
      const cart = await userCart(buyer.id);
      await addApparel(cart.id, ref.id, { colorId: "Evergreen", sizeLabel: "M" });

      const result = await createCheckoutAction(ADDRESS);
      expect("error" in result).toBe(true);
    });

    it("sends per-item assets in the Prodigi quote (avoids the 400)", async () => {
      let body: { items?: Array<{ sku?: string; assets?: unknown[] }> } | null = null;
      server.use(
        ...["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"].map((base) =>
          http.post(`${base}/quotes`, async ({ request }) => {
            body = (await request.json()) as typeof body;
            return HttpResponse.json({ quotes: [{ shipmentMethod: "Standard", costSummary: { shipping: { amount: "4.99", currency: "USD" } } }] });
          }),
        ),
      );
      const seller = await seedUser();
      const buyer = await seedUser();
      authAs(buyer.id);
      const print = await seedPrintListing(seller.id, { price: 40 });
      const cart = await userCart(buyer.id);
      await addPrint(cart.id, print.id, "GLOBAL-FAP-16X24", 40);

      await createCheckoutAction(ADDRESS);
      expect(body!.items?.[0]?.assets).toBeTruthy();
      expect(Array.isArray(body!.items![0].assets)).toBe(true);
    });
  });
});

// Open Q#7, resolved live 2026-06-17: Teemill method ids are per-order UUIDs, names
// are carrier services (incl. "Store Collect"), price in totalPrice.amount (GBP),
// and shipping is bundled into the item cost so it's typically £0.
describe("Teemill shipping-method selection", () => {
  const ADDR = { name: "J", line1: "1 St", city: "Portland", postal: "97206", country: "US" };

  function stubTeemillOrder(methods: Array<{ id: string; name: string; amount: string }>) {
    server.use(
      http.post("https://api.teemill.com/v1/orders", () =>
        HttpResponse.json(
          {
            id: "o1",
            fulfillments: [
              { id: "f1", availableShippingMethods: methods.map((m) => ({ id: m.id, name: m.name, totalPrice: { amount: m.amount } })) },
            ],
          },
          { status: 201 },
        ),
      ),
    );
  }

  it("never auto-selects in-store collect; picks the cheapest shippable method", async () => {
    const { TeemillFulfillmentProvider } = await import("@/lib/fulfillment/providers/teemill");
    stubTeemillOrder([
      { id: "collect", name: "Store Collect", amount: "0.00" },
      { id: "std", name: "Standard", amount: "3.99" },
      { id: "exp", name: "Express", amount: "7.99" },
    ]);
    const quote = await new TeemillFulfillmentProvider().quoteShipping([{ variantRef: "vr", quantity: 1 }], ADDR, { email: "b@e.com" });
    expect(quote.shippingMethod).toBe("Standard");
    expect(quote.shippingCost).toBe(3.99);
  });

  it("returns a genuine 0 when the cheapest shippable method is free (shipping bundled into item cost)", async () => {
    const { TeemillFulfillmentProvider } = await import("@/lib/fulfillment/providers/teemill");
    stubTeemillOrder([
      { id: "collect", name: "Store Collect", amount: "0.00" },
      { id: "usa", name: "Spring USA", amount: "0.00" },
    ]);
    const quote = await new TeemillFulfillmentProvider().quoteShipping([{ variantRef: "vr", quantity: 1 }], ADDR, { email: "b@e.com" });
    expect(quote.shippingMethod).toBe("Spring USA");
    expect(quote.shippingCost).toBe(0);
  });
});

// Designed (Prodigi) apparel: the quote item must carry size/colour attributes in
// Prodigi's RAW spelling + the "front" print area (Prodigi 400s otherwise).
describe("designed apparel Prodigi quote", () => {
  async function seedDesignedListing(sellerId: string) {
    const pt = await prisma.productType.create({
      data: {
        name: `Tee ${crypto.randomUUID()}`,
        fulfillmentProvider: "PRODIGI",
        providerSkuBase: "BELLA-3001",
        colors: { create: [{ colorName: "white", providerColorCode: "white", colorImageUrl: null }] },
        // sizeLabel stored canonical, providerSizeCode raw (as the sync writes it).
        sizes: { create: [{ sizeLabel: "XXL", providerSizeCode: "2xl", sortOrder: 0 }] },
      },
      include: { colors: true },
    });
    return prisma.apparelListing.create({
      data: {
        sellerId, sourcingMode: "DESIGNED", productTypeId: pt.id, title: "Designed Tee", retailPrice: 35,
        status: "ACTIVE", designImageUrl: "https://blob/design.png",
        colors: { create: pt.colors.map((c) => ({ productTypeColorId: c.id, isOffered: true })) },
      },
    });
  }

  it("sends size/colour attributes (raw spelling) and the 'front' print area", async () => {
    let body: { items?: Array<{ attributes?: Record<string, string>; assets?: Array<{ printArea?: string }> }> } | null = null;
    server.use(
      ...["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"].map((base) =>
        http.post(`${base}/quotes`, async ({ request }) => {
          body = (await request.json()) as typeof body;
          return HttpResponse.json({ quotes: [{ shipmentMethod: "Standard", costSummary: { shipping: { amount: "5.99", currency: "USD" } } }] });
        }),
      ),
    );
    const seller = await seedUser();
    const buyer = await seedUser();
    authAs(buyer.id);
    const listing = await seedDesignedListing(seller.id);
    const cart = await userCart(buyer.id);
    await addApparel(cart.id, listing.id, { colorId: "white", sizeLabel: "XXL" });

    const result = await createCheckoutAction(ADDRESS);
    expect("summary" in result).toBe(true);
    const item = body!.items![0];
    expect(item.attributes).toEqual({ size: "2xl", color: "white" });
    expect(item.assets?.[0]?.printArea).toBe("front");
  });
});
