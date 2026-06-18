import { describe, it, expect } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Pure type/contract tests — no DB, no external calls, no auth.

const {
  FulfillmentProvider,
  FULFILLMENT_STATUSES,
  getFulfillmentProvider,
  ProdigiFulfillmentProvider,
  TeemillFulfillmentProvider,
} = await import("@/lib/fulfillment/index");

import type {
  FulfillmentJob,
  FulfillmentOrderResult,
  ShippingQuote,
  ShippingQuoteItem,
  FulfillmentStatusQuery,
  FulfillmentStatusResult,
  FulfillmentShippingAddress,
} from "@/lib/fulfillment/types";

// ─── US-MFTF-12.1 — FulfillmentProvider abstract base class ───────────────────

const ADDRESS: FulfillmentShippingAddress = {
  name: "Jane Smith",
  line1: "123 High St",
  city: "London",
  postal: "SW1A 1AA",
  country: "GB",
};

const JOB: FulfillmentJob = {
  items: [{ sku: "GLOBAL-FAP-16X24", quantity: 1, sourceImageUrl: "https://blob.example.com/d.png" }],
  shippingAddress: ADDRESS,
};

/**
 * A complete concrete subclass used to exercise the template method. Records the
 * order in which the template's steps are invoked.
 */
function makeRecordingProvider() {
  const calls: string[] = [];

  class RecordingProvider extends FulfillmentProvider {
    name = "recording";

    async createOrder() {
      calls.push("createOrder");
      return { externalOrderId: "rec-1", estimatedDispatchDate: null, providerMetadata: {} };
    }
    async getOrderStatus() {
      return "PROCESSING" as const;
    }
    async quoteShipping(_items: ShippingQuoteItem[], _address: FulfillmentShippingAddress): Promise<ShippingQuote> {
      return { shippingMethod: "standard", shippingCost: 3.99, currency: "GBP" };
    }
    async checkFulfillmentStatus(_q: FulfillmentStatusQuery): Promise<FulfillmentStatusResult> {
      return { shipped: false, trackingNumber: null, carrier: null };
    }

    protected async validateJob(job: FulfillmentJob): Promise<void> {
      calls.push("validateJob");
      await super.validateJob(job);
    }
    protected async createProviderOrder(_job: FulfillmentJob): Promise<FulfillmentOrderResult> {
      calls.push("createProviderOrder");
      return { externalOrderId: "rec-order", estimatedDispatchDate: null, providerMetadata: { step: "create" } };
    }
    protected async confirmProviderOrder(
      _job: FulfillmentJob,
      created: FulfillmentOrderResult,
    ): Promise<FulfillmentOrderResult> {
      calls.push("confirmProviderOrder");
      return { ...created, providerMetadata: { step: "confirm" } };
    }
  }

  return { provider: new RecordingProvider(), calls };
}

describe("US-MFTF-12.1 — FulfillmentProvider abstract base class", () => {
  it("FulfillmentProvider is exported as a class (value), not just a type", () => {
    expect(typeof FulfillmentProvider).toBe("function");
  });

  it("still exports the six canonical FULFILLMENT_STATUSES (unchanged from MFTF-3)", () => {
    expect(FULFILLMENT_STATUSES).toHaveLength(6);
    for (const s of ["PROCESSING", "PRINTING", "SHIPPED", "DELIVERED", "CANCELLED", "ERROR"]) {
      expect(FULFILLMENT_STATUSES).toContain(s);
    }
  });

  describe("fulfill() template method", () => {
    it("orchestrates validate → create provider order → confirm, in that order", async () => {
      const { provider, calls } = makeRecordingProvider();
      await provider.fulfill(JOB);
      expect(calls).toEqual(["validateJob", "createProviderOrder", "confirmProviderOrder"]);
    });

    it("returns the result produced by the confirm step", async () => {
      const { provider } = makeRecordingProvider();
      const result = await provider.fulfill(JOB);
      expect(result.externalOrderId).toBe("rec-order");
      expect(result.providerMetadata).toEqual({ step: "confirm" });
    });

    it("default validateJob rejects a job with no items", async () => {
      const { provider } = makeRecordingProvider();
      await expect(provider.fulfill({ items: [], shippingAddress: ADDRESS })).rejects.toThrow();
    });

    it("default validateJob rejects a job missing a shipping address", async () => {
      const { provider } = makeRecordingProvider();
      await expect(
        provider.fulfill({ items: JOB.items, shippingAddress: undefined as unknown as FulfillmentShippingAddress }),
      ).rejects.toThrow();
    });
  });

  describe("subclasses extend the base class", () => {
    it("ProdigiFulfillmentProvider is an instance of FulfillmentProvider", () => {
      expect(new ProdigiFulfillmentProvider()).toBeInstanceOf(FulfillmentProvider);
    });

    it("TeemillFulfillmentProvider is an instance of FulfillmentProvider", () => {
      expect(new TeemillFulfillmentProvider()).toBeInstanceOf(FulfillmentProvider);
    });

    it("factory returns base-class-typed instances", () => {
      expect(getFulfillmentProvider("PRINT")).toBeInstanceOf(FulfillmentProvider);
      expect(getFulfillmentProvider("APPAREL")).toBeInstanceOf(FulfillmentProvider);
    });

    it("factory still routes APPAREL → Teemill and PRINT → Prodigi (routing unchanged in 12.1)", () => {
      expect(getFulfillmentProvider("APPAREL")).toBeInstanceOf(TeemillFulfillmentProvider);
      expect(getFulfillmentProvider("PRINT")).toBeInstanceOf(ProdigiFulfillmentProvider);
    });
  });

  describe("new abstract methods exist on the providers", () => {
    it("Prodigi exposes quoteShipping and checkFulfillmentStatus", () => {
      const p = new ProdigiFulfillmentProvider();
      expect(typeof p.quoteShipping).toBe("function");
      expect(typeof p.checkFulfillmentStatus).toBe("function");
      expect(typeof p.fulfill).toBe("function");
    });

    it("Teemill exposes quoteShipping and checkFulfillmentStatus", () => {
      const p = new TeemillFulfillmentProvider();
      expect(typeof p.quoteShipping).toBe("function");
      expect(typeof p.checkFulfillmentStatus).toBe("function");
      expect(typeof p.fulfill).toBe("function");
    });
  });
});

// ─── Type-level fixture (verified by `tsc`, not at runtime) ───────────────────
// A subclass that omits abstract methods must FAIL TypeScript compilation. The
// directive below consumes that error; if the class were ever completed, tsc
// would flag the directive as unused — keeping this honest. (Prose here avoids
// the literal directive token so tsc doesn't parse it as a second directive.)

// @ts-expect-error — IncompleteProvider omits required abstract methods
class IncompleteProvider extends FulfillmentProvider {
  name = "incomplete";
  // intentionally omits createOrder/getOrderStatus/quoteShipping/
  // checkFulfillmentStatus/createProviderOrder
}

// Reference the type so it is not elided, without instantiating it at runtime.
export type _IncompleteProviderType = IncompleteProvider;
