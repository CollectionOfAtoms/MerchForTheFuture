import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

const { ProdigiFulfillmentProvider } = await import("@/lib/fulfillment/providers/prodigi");
const { getFulfillmentProvider } = await import("@/lib/fulfillment/index");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRODIGI_BASES = [
  "https://api.prodigi.com/v4.0",
  "https://api.sandbox.prodigi.com/v4.0",
];

const baseParams = {
  listingRef: "listing-abc",
  colorVariantId: "GLOBAL-FAP-16X24",
  size: "16x24",
  quantity: 1,
  buyerName: "Jane Smith",
  sourceImageUrl: "https://blob.example.com/design.png",
  shippingAddress: {
    name: "Jane Smith",
    line1: "123 High St",
    line2: "",
    city: "London",
    state: "",
    postal: "SW1A 1AA",
    country: "GB",
  },
};

// ─── US-MFTF-3.2 — Refactor Prodigi Behind the Interface ─────────────────────

describe("US-MFTF-3.2 — ProdigiFulfillmentProvider", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  // ── Identity ──────────────────────────────────────────────────────────────

  it("has name === 'prodigi'", () => {
    const provider = new ProdigiFulfillmentProvider();
    expect(provider.name).toBe("prodigi");
  });

  it("getFulfillmentProvider('PRINT') returns a ProdigiFulfillmentProvider", () => {
    const provider = getFulfillmentProvider("PRINT");
    expect(provider).toBeInstanceOf(ProdigiFulfillmentProvider);
  });

  // ── createOrder — outbound request shape ─────────────────────────────────

  describe("createOrder()", () => {
    it("POSTs to the Prodigi /orders endpoint", async () => {
      let capturedUrl: string | undefined;
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.post(`${base}/orders`, ({ request }) => {
            capturedUrl = request.url;
            return HttpResponse.json({
              outcome: "Created",
              order: { id: "ord-test-123", status: { stage: "InProgress" } },
            });
          })
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      await provider.createOrder(baseParams);

      expect(capturedUrl).toMatch(/\/orders$/);
    });

    it("sends the correct X-API-Key header", async () => {
      let capturedApiKey: string | null = null;
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.post(`${base}/orders`, ({ request }) => {
            capturedApiKey = request.headers.get("X-API-Key");
            return HttpResponse.json({
              outcome: "Created",
              order: { id: "ord-test-123", status: { stage: "InProgress" } },
            });
          })
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      await provider.createOrder(baseParams);

      expect(capturedApiKey).toBeTruthy();
    });

    it("sends shippingMethod: 'Standard' in the request body", async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.post(`${base}/orders`, async ({ request }) => {
            capturedBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json({
              outcome: "Created",
              order: { id: "ord-test-123", status: { stage: "InProgress" } },
            });
          })
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      await provider.createOrder(baseParams);

      expect(capturedBody.shippingMethod).toBe("Standard");
    });

    it("sends recipient with buyer name and shipping address in the request body", async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.post(`${base}/orders`, async ({ request }) => {
            capturedBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json({
              outcome: "Created",
              order: { id: "ord-test-123", status: { stage: "InProgress" } },
            });
          })
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      await provider.createOrder(baseParams);

      const recipient = capturedBody.recipient as Record<string, unknown>;
      expect(recipient.name).toBe("Jane Smith");
      const address = recipient.address as Record<string, unknown>;
      expect(address.line1).toBe("123 High St");
      expect(address.townOrCity).toBe("London");
      expect(address.postalOrZipCode).toBe("SW1A 1AA");
      expect(address.countryCode).toBe("GB");
    });

    it("sends the correct SKU and source image URL in items", async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.post(`${base}/orders`, async ({ request }) => {
            capturedBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json({
              outcome: "Created",
              order: { id: "ord-test-123", status: { stage: "InProgress" } },
            });
          })
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      await provider.createOrder(baseParams);

      const items = capturedBody.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0].sku).toBe("GLOBAL-FAP-16X24");
      expect(items[0].copies).toBe(1);
      const assets = items[0].assets as Array<Record<string, unknown>>;
      expect(assets[0].url).toBe("https://blob.example.com/design.png");
    });

    it("returns a FulfillmentOrderResult with externalOrderId from Prodigi response", async () => {
      const provider = new ProdigiFulfillmentProvider();
      const result = await provider.createOrder(baseParams);

      expect(result.externalOrderId).toBe("ord-test-mock");
    });

    it("returns a FulfillmentOrderResult with estimatedDispatchDate", async () => {
      const provider = new ProdigiFulfillmentProvider();
      const result = await provider.createOrder(baseParams);

      // May be null/undefined if Prodigi doesn't return one — but the field must exist
      expect("estimatedDispatchDate" in result).toBe(true);
    });

    it("returns providerMetadata as serialisable JSON", async () => {
      const provider = new ProdigiFulfillmentProvider();
      const result = await provider.createOrder(baseParams);

      expect(() => JSON.stringify(result.providerMetadata)).not.toThrow();
    });

    it("throws if Prodigi returns a non-ok response", async () => {
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.post(`${base}/orders`, () =>
            HttpResponse.json({ detail: "Invalid request" }, { status: 400 })
          )
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      await expect(provider.createOrder(baseParams)).rejects.toThrow();
    });
  });

  // ── getOrderStatus ─────────────────────────────────────────────────────────

  describe("getOrderStatus()", () => {
    it("GETs the Prodigi /orders/:id endpoint", async () => {
      let capturedUrl: string | undefined;
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.get(`${base}/orders/:orderId`, ({ request }) => {
            capturedUrl = request.url;
            return HttpResponse.json({
              order: { id: "ord-test-123", status: { stage: "InProgress" }, shipments: [] },
            });
          })
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      await provider.getOrderStatus("ord-test-123");

      expect(capturedUrl).toContain("ord-test-123");
    });

    it("maps Prodigi 'InProgress' stage to canonical PROCESSING status", async () => {
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.get(`${base}/orders/:orderId`, () =>
            HttpResponse.json({
              order: { id: "ord-test-123", status: { stage: "InProgress" }, shipments: [] },
            })
          )
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      const status = await provider.getOrderStatus("ord-test-123");

      expect(status).toBe("PROCESSING");
    });

    it("maps Prodigi 'Complete' stage with shipments to canonical SHIPPED status", async () => {
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.get(`${base}/orders/:orderId`, () =>
            HttpResponse.json({
              order: {
                id: "ord-test-123",
                status: { stage: "Complete" },
                shipments: [{ id: "sh-1", carrier: { name: "Royal Mail" }, tracking: { code: "RM123" } }],
              },
            })
          )
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      const status = await provider.getOrderStatus("ord-test-123");

      expect(status).toBe("SHIPPED");
    });

    it("maps Prodigi 'Cancelled' stage to canonical CANCELLED status", async () => {
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.get(`${base}/orders/:orderId`, () =>
            HttpResponse.json({
              order: { id: "ord-test-123", status: { stage: "Cancelled" }, shipments: [] },
            })
          )
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      const status = await provider.getOrderStatus("ord-test-123");

      expect(status).toBe("CANCELLED");
    });

    it("returns ERROR for an unrecognised Prodigi stage", async () => {
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.get(`${base}/orders/:orderId`, () =>
            HttpResponse.json({
              order: { id: "ord-test-123", status: { stage: "UnknownFutureStage" }, shipments: [] },
            })
          )
        )
      );

      const provider = new ProdigiFulfillmentProvider();
      const status = await provider.getOrderStatus("ord-test-123");

      expect(status).toBe("ERROR");
    });
  });

  // ── Regression: existing Epic 8 / 15 print order path still works ─────────
  // These tests verify the call sites (confirmShippingAction, createPrintOrder)
  // route through the abstraction layer without breaking.

  describe("regression — createPrintOrder still submits to Prodigi", () => {
    it("createPrintOrder still POSTs to Prodigi /orders and creates an order record", async () => {
      let prodigiCalled = false;
      server.use(
        ...PRODIGI_BASES.map((base) =>
          http.post(`${base}/orders`, () => {
            prodigiCalled = true;
            return HttpResponse.json({
              outcome: "Created",
              order: { id: "ord-regression-test", status: { stage: "InProgress" } },
            });
          })
        )
      );

      // Set up the minimum DB fixtures for createPrintOrder
      const seller = await prisma.user.create({
        data: { email: "seller@test.com", name: "Seller", roles: ["SELLER"] },
      });
      const buyer = await prisma.user.create({
        data: { email: "buyer@test.com", name: "Buyer", roles: ["BUYER"] },
      });
      const artwork = await prisma.artwork.create({
        data: {
          sellerId: seller.id,
          title: "Test Art",
          artist: "Tester",
          description: "desc",
          status: "PUBLISHED",
        },
      });
      const listing = await prisma.originalListing.create({
        data: {
          artworkId: artwork.id,
          saleType: "FIXED_PRICE",
          price: 100,
          availableForPrint: true,
          printSourceImageUrl: "https://blob.example.com/source.png",
          printProducts: [{ sku: "GLOBAL-FAP-16X24", size: "16x24", price: 3500 }],
        },
      });

      const { createPrintOrder } = await import("@/lib/print/order");
      const order = await createPrintOrder({
        buyerId: buyer.id,
        originalListingId: listing.id,
        sku: "GLOBAL-FAP-16X24",
        size: "16x24",
        quantity: 1,
        shipping: {
          name: "Buyer Name",
          line1: "1 Test St",
          city: "Testville",
          state: "",
          postal: "12345",
          country: "US",
        },
      });

      expect(prodigiCalled).toBe(true);
      expect(order.prodigiOrderId).toBe("ord-regression-test");
      expect(order.status).toBe("PROCESSING");
    });
  });
});
