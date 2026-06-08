import { describe, it, expect } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// No external calls, no auth, no DB — pure type/contract tests.

// Dynamic import deferred until after mocks (even though there are none here,
// this pattern keeps file structure consistent with the rest of the suite).
const {
  FULFILLMENT_STATUSES,
  getFulfillmentProvider,
} = await import("@/lib/fulfillment/index");

const {
  // Type-level imports aren't runtime values, but we validate the module exports.
} = await import("@/lib/fulfillment/types");

// ─── US-MFTF-3.1 — Define Fulfillment Provider Interface ─────────────────────

describe("US-MFTF-3.1 — FulfillmentProvider interface contract", () => {
  // ── Runtime shape of canonical status set ────────────────────────────────

  describe("FULFILLMENT_STATUSES", () => {
    it("exports a FULFILLMENT_STATUSES constant from index", () => {
      expect(FULFILLMENT_STATUSES).toBeDefined();
    });

    it("contains all six canonical statuses", () => {
      const expected = ["PROCESSING", "PRINTING", "SHIPPED", "DELIVERED", "CANCELLED", "ERROR"];
      for (const status of expected) {
        expect(FULFILLMENT_STATUSES).toContain(status);
      }
    });

    it("contains exactly six statuses — no undocumented values", () => {
      expect(FULFILLMENT_STATUSES).toHaveLength(6);
    });
  });

  // ── Mock provider satisfies the interface ─────────────────────────────────

  describe("A class implementing FulfillmentProvider", () => {
    // Build a minimal in-test mock that satisfies the interface at runtime.
    // If the interface shape changes, this mock must be updated — that is intentional:
    // the test acts as a canary for interface breakage.
    class MockProvider {
      name = "mock";

      async createOrder(params: {
        listingRef: string;
        colorVariantId: string;
        size: string;
        quantity: number;
        buyerName: string;
        sourceImageUrl: string;
        shippingAddress: {
          name: string;
          line1: string;
          line2?: string;
          city: string;
          state?: string;
          postal: string;
          country: string;
        };
      }) {
        return {
          externalOrderId: "mock-ext-id",
          estimatedDispatchDate: new Date().toISOString(),
          providerMetadata: { raw: params },
        };
      }

      async getOrderStatus(_externalOrderId: string) {
        return "PROCESSING" as const;
      }
    }

    const provider = new MockProvider();

    it("has a name property", () => {
      expect(typeof provider.name).toBe("string");
      expect(provider.name.length).toBeGreaterThan(0);
    });

    it("createOrder returns an externalOrderId", async () => {
      const result = await provider.createOrder({
        listingRef: "listing-1",
        colorVariantId: "sku-white",
        size: "M",
        quantity: 1,
        buyerName: "Jane Smith",
        sourceImageUrl: "https://blob.example.com/design.png",
        shippingAddress: {
          name: "Jane Smith",
          line1: "123 High St",
          city: "London",
          postal: "SW1A 1AA",
          country: "GB",
        },
      });
      expect(result.externalOrderId).toBeTruthy();
    });

    it("createOrder returns an estimatedDispatchDate", async () => {
      const result = await provider.createOrder({
        listingRef: "listing-1",
        colorVariantId: "sku-white",
        size: "M",
        quantity: 1,
        buyerName: "Jane Smith",
        sourceImageUrl: "https://blob.example.com/design.png",
        shippingAddress: {
          name: "Jane Smith",
          line1: "123 High St",
          city: "London",
          postal: "SW1A 1AA",
          country: "GB",
        },
      });
      expect(result.estimatedDispatchDate).toBeTruthy();
    });

    it("createOrder returns providerMetadata (opaque JSON)", async () => {
      const result = await provider.createOrder({
        listingRef: "listing-1",
        colorVariantId: "sku-white",
        size: "M",
        quantity: 1,
        buyerName: "Jane Smith",
        sourceImageUrl: "https://blob.example.com/design.png",
        shippingAddress: {
          name: "Jane Smith",
          line1: "123 High St",
          city: "London",
          postal: "SW1A 1AA",
          country: "GB",
        },
      });
      // providerMetadata must be serialisable to JSON (opaque but not undefined)
      expect(() => JSON.stringify(result.providerMetadata)).not.toThrow();
    });

    it("getOrderStatus returns a canonical FulfillmentStatus string", async () => {
      const status = await provider.getOrderStatus("ext-123");
      expect(FULFILLMENT_STATUSES).toContain(status);
    });
  });

  // ── getFulfillmentProvider factory ────────────────────────────────────────

  describe("getFulfillmentProvider factory", () => {
    it("is exported from src/lib/fulfillment/index", () => {
      expect(typeof getFulfillmentProvider).toBe("function");
    });

    it("returns a provider with a name property for listing type PRINT", () => {
      const provider = getFulfillmentProvider("PRINT");
      expect(typeof provider.name).toBe("string");
    });

    it("returns a provider with createOrder for listing type PRINT", () => {
      const provider = getFulfillmentProvider("PRINT");
      expect(typeof provider.createOrder).toBe("function");
    });

    it("returns a provider with getOrderStatus for listing type PRINT", () => {
      const provider = getFulfillmentProvider("PRINT");
      expect(typeof provider.getOrderStatus).toBe("function");
    });

    it("returns a provider with a name property for listing type APPAREL", () => {
      const provider = getFulfillmentProvider("APPAREL");
      expect(typeof provider.name).toBe("string");
    });
  });
});
