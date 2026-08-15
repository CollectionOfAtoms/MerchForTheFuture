import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";

// US-MFTF-17.2 — Printify provider (DESIGNED mode). Mode-independent provider
// contract: subclasses the FulfillmentProvider base, quotes USD shipping, places a
// TWO-STEP order (create → send-to-production), polls status, and owns its raw→
// canonical status mapping. All Printify HTTP is stubbed by MSW — no live calls.
// Shapes per docs/printify-api-notes.md (live-verified catalog/shipping; order/
// status/webhook shapes // UNVERIFIED, resolved at US-MFTF-17.3).

// Pin the shop id so the client builds shop-scoped paths deterministically.
process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";
process.env.PRINTIFY_WEBHOOK_SECRET = "whsec_test";

const {
  FulfillmentProvider,
  PrintifyFulfillmentProvider,
  getProviderByKey,
} = await import("@/lib/fulfillment");
const {
  mapPrintifyStatusToCanonical,
  mapPrintifyEventToStatus,
  verifyPrintifySignature,
} = await import("@/lib/fulfillment/providers/printify");
const { __resetPrintifyShopIdCache } = await import("@/lib/fulfillment/printify/client");

import type {
  FulfillmentJob,
  FulfillmentShippingAddress,
  ShippingQuoteItem,
} from "@/lib/fulfillment/types";

const ADDRESS: FulfillmentShippingAddress = {
  name: "Jane Smith",
  line1: "1 Main St",
  city: "Portland",
  state: "OR",
  postal: "97201",
  country: "US",
};

const PRINTIFY_ITEM: ShippingQuoteItem = {
  printifyBlueprintId: 5,
  printifyPrintProviderId: 41,
  printifyVariantId: 17391,
  quantity: 1,
  sourceImageUrl: "https://blob.example.com/design.png",
  printArea: "front",
};

const JOB: FulfillmentJob = { items: [PRINTIFY_ITEM], shippingAddress: ADDRESS };

describe("US-MFTF-17.2 — PrintifyFulfillmentProvider (DESIGNED)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extends the FulfillmentProvider base class and is named 'printify'", () => {
    const p = new PrintifyFulfillmentProvider();
    expect(p).toBeInstanceOf(FulfillmentProvider);
    expect(p.name).toBe("printify");
  });

  it("factory getProviderByKey('printify') returns a base-class-typed instance", () => {
    expect(getProviderByKey("printify")).toBeInstanceOf(PrintifyFulfillmentProvider);
    expect(getProviderByKey("PRINTIFY")).toBeInstanceOf(FulfillmentProvider);
  });

  it("exposes quoteShipping, checkFulfillmentStatus and the fulfill() template", () => {
    const p = new PrintifyFulfillmentProvider();
    expect(typeof p.quoteShipping).toBe("function");
    expect(typeof p.checkFulfillmentStatus).toBe("function");
    expect(typeof p.fulfill).toBe("function");
  });

  describe("quoteShipping", () => {
    it("returns a USD quote, converting Printify integer cents to dollars", async () => {
      // orders/shipping.json → { standard: 1959 } cents.
      server.use(
        http.post("https://api.printify.com/v1/shops/:shop/orders/shipping.json", () =>
          HttpResponse.json({ standard: 1959, express: 2959 }),
        ),
      );
      const quote = await new PrintifyFulfillmentProvider().quoteShipping([PRINTIFY_ITEM], ADDRESS);
      expect(quote.currency).toBe("USD");
      expect(quote.shippingMethod).toBe("standard");
      expect(quote.shippingCost).toBeCloseTo(19.59, 2);
      // Every returned method surfaces as a buyer-selectable option, cheapest first.
      expect(quote.options?.[0]).toMatchObject({ method: "standard", cost: 19.59 });
      expect(quote.options?.map((o) => o.method)).toContain("express");
    });
  });

  describe("shop-id resolution (fix: shop-scoped calls 404 on /shops//… when unset)", () => {
    const saved = process.env.PRINTIFY_SHOP_ID;
    beforeEach(() => {
      delete process.env.PRINTIFY_SHOP_ID;
      __resetPrintifyShopIdCache();
    });
    afterEach(() => {
      if (saved !== undefined) process.env.PRINTIFY_SHOP_ID = saved;
      __resetPrintifyShopIdCache();
    });

    it("fetches the shop id from /shops.json when PRINTIFY_SHOP_ID is unset, building a well-formed URL", async () => {
      let capturedUrl = "";
      server.use(
        http.get("https://api.printify.com/v1/shops.json", () => HttpResponse.json([{ id: 28204676 }])),
        http.post("https://api.printify.com/v1/shops/:shop/orders/shipping.json", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ standard: 1959 });
        }),
      );
      const quote = await new PrintifyFulfillmentProvider().quoteShipping([PRINTIFY_ITEM], ADDRESS);
      expect(quote.shippingCost).toBeCloseTo(19.59, 2);
      expect(capturedUrl).toContain("/shops/28204676/orders/shipping.json");
      expect(capturedUrl).not.toContain("/shops//"); // the bug: empty id → malformed path → 404
    });

    it("throws a clear error when the account has no shop", async () => {
      server.use(http.get("https://api.printify.com/v1/shops.json", () => HttpResponse.json([])));
      await expect(
        new PrintifyFulfillmentProvider().quoteShipping([PRINTIFY_ITEM], ADDRESS),
      ).rejects.toThrow(/no shop/i);
    });
  });

  describe("fulfill() — two-step create → send-to-production", () => {
    /** Record the order of Printify write calls hit during fulfill(). */
    function captureOrderCalls() {
      const calls: string[] = [];
      let orderBody: { line_items?: unknown[]; address_to?: unknown } | null = null;
      server.use(
        http.post("https://api.printify.com/v1/uploads/images.json", async () => {
          calls.push("upload");
          return HttpResponse.json({ id: "img-mock-1", file_name: "design.png" });
        }),
        http.post("https://api.printify.com/v1/shops/:shop/orders.json", async ({ request }) => {
          calls.push("create");
          orderBody = (await request.json()) as typeof orderBody;
          return HttpResponse.json({ id: "printify-order-1", status: "pending" });
        }),
        http.post(
          "https://api.printify.com/v1/shops/:shop/orders/:id/send-to-production.json",
          () => {
            calls.push("send-to-production");
            return HttpResponse.json({ id: "printify-order-1", status: "in-production" });
          },
        ),
      );
      return { calls, get: () => orderBody };
    }

    it("uploads the design, creates the order, THEN sends it to production, in order", async () => {
      const cap = captureOrderCalls();
      const result = await new PrintifyFulfillmentProvider().fulfill(JOB);
      expect(result.externalOrderId).toBe("printify-order-1");
      // send-to-production must be LAST — it is the commit step (the safety valve).
      expect(cap.calls[cap.calls.length - 1]).toBe("send-to-production");
      expect(cap.calls).toContain("create");
      expect(cap.calls.indexOf("create")).toBeLessThan(cap.calls.indexOf("send-to-production"));
    });

    it("submits blueprint + print-provider + variant ids and the uploaded design", async () => {
      const cap = captureOrderCalls();
      await new PrintifyFulfillmentProvider().fulfill(JOB);
      const line = (cap.get()!.line_items as Array<Record<string, unknown>>)[0];
      expect(line).toMatchObject({
        blueprint_id: 5,
        print_provider_id: 41,
        variant_id: 17391,
        quantity: 1,
      });
      // The uploaded image id must reach the order's print area.
      expect(JSON.stringify(line)).toContain("img-mock-1");
    });

    it("throws when order creation fails, so the fan-out marks the shipment FAILED", async () => {
      server.use(
        http.post("https://api.printify.com/v1/uploads/images.json", () =>
          HttpResponse.json({ id: "img-mock-1" }),
        ),
        http.post("https://api.printify.com/v1/shops/:shop/orders.json", () =>
          HttpResponse.json({ message: "boom" }, { status: 500 }),
        ),
      );
      await expect(new PrintifyFulfillmentProvider().fulfill(JOB)).rejects.toThrow();
    });
  });

  describe("checkFulfillmentStatus — polling backstop", () => {
    it("maps an in-production order to PRINTING", async () => {
      server.use(
        http.get("https://api.printify.com/v1/shops/:shop/orders/:id.json", ({ params }) =>
          HttpResponse.json({ id: params.id, status: "in-production", shipments: [] }),
        ),
      );
      const r = await new PrintifyFulfillmentProvider().checkFulfillmentStatus({
        provider: "printify",
        providerOrderId: "printify-order-1",
      });
      expect(r.status).toBe("PRINTING");
      expect(r.shipped).toBe(false);
    });

    it("returns tracking on a shipped order", async () => {
      server.use(
        http.get("https://api.printify.com/v1/shops/:shop/orders/:id.json", ({ params }) =>
          HttpResponse.json({
            id: params.id,
            status: "fulfilled",
            shipments: [{ carrier: "usps", number: "TRK123" }],
          }),
        ),
      );
      const r = await new PrintifyFulfillmentProvider().checkFulfillmentStatus({
        provider: "printify",
        providerOrderId: "printify-order-1",
      });
      expect(r.status).toBe("SHIPPED");
      expect(r.shipped).toBe(true);
      expect(r.trackingNumber).toBe("TRK123");
      expect(r.carrier).toBe("usps");
    });

    it("returns a null status (no transition) when there is no provider order id", async () => {
      const r = await new PrintifyFulfillmentProvider().checkFulfillmentStatus({
        provider: "printify",
        providerOrderId: null,
      });
      expect(r.status).toBeNull();
      expect(r.shipped).toBe(false);
    });
  });

  describe("mapPrintifyStatusToCanonical — provider owns its vocabulary", () => {
    it("maps known order statuses onto the canonical set", () => {
      expect(mapPrintifyStatusToCanonical("pending")).toBe("PROCESSING");
      expect(mapPrintifyStatusToCanonical("on-hold")).toBe("PROCESSING");
      expect(mapPrintifyStatusToCanonical("in-production")).toBe("PRINTING");
      expect(mapPrintifyStatusToCanonical("fulfilled")).toBe("SHIPPED");
      expect(mapPrintifyStatusToCanonical("canceled")).toBe("CANCELLED");
    });

    it("returns null for an unknown status (a logged warning, never a silent transition)", () => {
      expect(mapPrintifyStatusToCanonical("banana")).toBeNull();
      expect(mapPrintifyStatusToCanonical(undefined)).toBeNull();
    });
  });

  describe("mapPrintifyEventToStatus — webhook events (// UNVERIFIED payloads)", () => {
    it("maps sent-to-production → PRINTING and shipment:created → SHIPPED with tracking", () => {
      const printing = mapPrintifyEventToStatus({
        type: "order:sent-to-production",
        resource: { id: "printify-order-1" },
      });
      expect(printing).toMatchObject({ providerOrderId: "printify-order-1", status: "PRINTING" });

      const shipped = mapPrintifyEventToStatus({
        type: "order:shipment:created",
        resource: { id: "printify-order-1", data: { shipments: [{ carrier: "usps", number: "TRK9" }] } },
      });
      expect(shipped).toMatchObject({
        providerOrderId: "printify-order-1",
        status: "SHIPPED",
        trackingNumber: "TRK9",
        carrier: "usps",
      });
    });

    it("returns null for an event type outside the handled set", () => {
      expect(mapPrintifyEventToStatus({ type: "order:created", resource: { id: "x" } })).toBeNull();
      expect(mapPrintifyEventToStatus({ type: "order:shipment:created", resource: {} })).toBeNull();
    });
  });

  describe("verifyPrintifySignature — HMAC-SHA256 over the raw body", () => {
    it("accepts a correct signature and rejects a tampered body", async () => {
      const crypto = await import("node:crypto");
      const secret = "whsec_test";
      const body = JSON.stringify({ type: "order:sent-to-production", resource: { id: "o1" } });
      const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
      expect(verifyPrintifySignature(body, sig, secret)).toBe(true);
      expect(verifyPrintifySignature(body + "x", sig, secret)).toBe(false);
      expect(verifyPrintifySignature(body, "deadbeef", secret)).toBe(false);
    });
  });
});

// ─── Type-level fixture (verified by `tsc`, not at runtime) ───────────────────
// A Printify-flavoured subclass that omits abstract methods must FAIL compilation,
// same honesty check as US-MFTF-12.1. Prose avoids the literal directive token.

// @ts-expect-error — IncompletePrintify omits required abstract methods
class IncompletePrintify extends FulfillmentProvider {
  name = "incomplete-printify";
  // intentionally omits createOrder/getOrderStatus/quoteShipping/
  // checkFulfillmentStatus/createProviderOrder
}
export type _IncompletePrintifyType = IncompletePrintify;
