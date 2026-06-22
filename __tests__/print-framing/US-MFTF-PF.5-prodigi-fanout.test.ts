import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { prisma, resetDatabase } from "../helpers/db";
import type { FulfillmentJob, ShippingQuoteItem, FulfillmentShippingAddress } from "@/lib/fulfillment/types";

const { ProdigiFulfillmentProvider } = await import("@/lib/fulfillment/providers/prodigi");
const { resolvePrintFanout, upsertFraming } = await import("@/lib/print/framing");

const PRODIGI_BASE = process.env.PRODIGI_API_BASE_URL ?? "https://api.prodigi.com/v4.0";
const ADDRESS: FulfillmentShippingAddress = {
  name: "Pat Buyer", line1: "1 Main St", city: "Portland", state: "OR", postal: "97201", country: "US",
};

function captureOrderBody(): { body: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};
  server.use(
    http.post(`${PRODIGI_BASE}/orders`, async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ outcome: "Created", order: { id: "ord-pf5", status: { stage: "InProgress" } } });
    }),
  );
  return { body: () => captured };
}

function captureQuoteBody(): { body: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};
  server.use(
    http.post(`${PRODIGI_BASE}/quotes`, async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ quotes: [{ shipmentMethod: "Standard", costSummary: { shipping: { amount: "4.99", currency: "USD" } } }] });
    }),
  );
  return { body: () => captured };
}

function job(items: ShippingQuoteItem[]): FulfillmentJob {
  return { items, shippingAddress: ADDRESS };
}

describe("US-MFTF-PF.5 — fan-out sends wrap + cropped asset to Prodigi", () => {
  let provider: InstanceType<typeof ProdigiFulfillmentProvider>;

  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    provider = new ProdigiFulfillmentProvider();
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  describe("resolvePrintFanout", () => {
    let artworkId: string;
    beforeEach(async () => {
      const seller = await prisma.user.create({ data: { email: "s@t.com", name: "S", passwordHash: "x", roles: ["SELLER"] } });
      const artwork = await prisma.artwork.create({ data: { title: "A", description: "d", sellerId: seller.id, status: "PUBLISHED" } });
      artworkId = artwork.id;
    });

    it("returns the canvas crop + the stored wrap as a Prodigi attribute", async () => {
      await upsertFraming(artworkId, "4:5", { croppedUrl: "https://blob/crop45.jpg", wrap: "BLACK" });
      const r = await resolvePrintFanout({ artworkId, sku: "GLOBAL-CAN-8X10", sizeLabel: "8×10 in" });
      expect(r.sourceImageUrl).toBe("https://blob/crop45.jpg");
      expect(r.attributes).toEqual({ wrap: "Black" });
      expect(r.framed).toBe(true);
    });

    it("defaults canvas wrap to MirrorWrap when none is stored", async () => {
      await upsertFraming(artworkId, "4:5", { croppedUrl: "https://blob/crop45.jpg" });
      const r = await resolvePrintFanout({ artworkId, sku: "GLOBAL-CAN-8X10", sizeLabel: "8×10 in" });
      expect(r.attributes).toEqual({ wrap: "MirrorWrap" });
    });

    it("sends the crop and no wrap for a paper item", async () => {
      await upsertFraming(artworkId, "2:3", { croppedUrl: "https://blob/crop23.jpg" });
      const r = await resolvePrintFanout({ artworkId, sku: "GLOBAL-FAP-12X18", sizeLabel: "12×18 in" });
      expect(r.sourceImageUrl).toBe("https://blob/crop23.jpg");
      expect(r.attributes).toEqual({});
      expect(r.framed).toBe(true);
    });

    it("falls back to the original source + MirrorWrap (canvas) and logs an anomaly when no crop exists", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const r = await resolvePrintFanout({ artworkId, sku: "GLOBAL-CAN-8X10", sizeLabel: "8×10 in", fallbackSourceUrl: "https://cdn/orig.jpg" });
      expect(r.sourceImageUrl).toBe("https://cdn/orig.jpg");
      expect(r.attributes).toEqual({ wrap: "MirrorWrap" });
      expect(r.framed).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("ANOMALY"));
    });
  });

  describe("createProviderOrder body", () => {
    it("canvas: framed crop URL + attributes.wrap + sizing fitPrintArea (no fillPrintArea)", async () => {
      const cap = captureOrderBody();
      await provider.fulfill(job([
        { sku: "GLOBAL-CAN-8X10", quantity: 1, sourceImageUrl: "https://blob/crop45.jpg", attributes: { wrap: "MirrorWrap" }, framed: true },
      ]));
      const items = cap.body().items as Array<Record<string, unknown>>;
      expect(items[0].sizing).toBe("fitPrintArea");
      expect(items[0].attributes).toEqual({ wrap: "MirrorWrap" });
      const assets = items[0].assets as Array<Record<string, unknown>>;
      expect(assets[0]).toEqual({ printArea: "default", url: "https://blob/crop45.jpg" });
    });

    it("paper: framed crop URL + no wrap attribute + sizing fitPrintArea", async () => {
      const cap = captureOrderBody();
      await provider.fulfill(job([
        { sku: "GLOBAL-FAP-12X18", quantity: 1, sourceImageUrl: "https://blob/crop23.jpg", attributes: {}, framed: true },
      ]));
      const items = cap.body().items as Array<Record<string, unknown>>;
      expect(items[0].sizing).toBe("fitPrintArea");
      expect(items[0].attributes).toBeUndefined();
      const assets = items[0].assets as Array<Record<string, unknown>>;
      expect(assets[0]).toEqual({ printArea: "default", url: "https://blob/crop23.jpg" });
    });

    it("apparel (unframed) path is unchanged — fillPrintArea + size/colour attributes", async () => {
      const cap = captureOrderBody();
      await provider.fulfill(job([
        { sku: "TEEBLANK", quantity: 1, sourceImageUrl: "https://blob/design.png", attributes: { size: "l", color: "white" }, printArea: "front" },
      ]));
      const items = cap.body().items as Array<Record<string, unknown>>;
      expect(items[0].sizing).toBe("fillPrintArea");
      expect(items[0].attributes).toEqual({ size: "l", color: "white" });
      const assets = items[0].assets as Array<Record<string, unknown>>;
      expect(assets[0]).toEqual({ printArea: "front", url: "https://blob/design.png" });
    });
  });

  describe("quoteShipping body (parity)", () => {
    it("canvas line item carries attributes.wrap on the quote", async () => {
      const cap = captureQuoteBody();
      await provider.quoteShipping(
        [{ sku: "GLOBAL-CAN-8X10", quantity: 1, attributes: { wrap: "MirrorWrap" }, framed: true }],
        ADDRESS,
      );
      const items = cap.body().items as Array<Record<string, unknown>>;
      expect(items[0].attributes).toEqual({ wrap: "MirrorWrap" });
    });
  });
});
