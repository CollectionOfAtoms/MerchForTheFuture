import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { applyFulfillmentTransition, canonicalToDbStatus } = await import("@/lib/fulfillment/status");
const { ProdigiFulfillmentProvider } = await import("@/lib/fulfillment/providers/prodigi");
const { TeemillFulfillmentProvider } = await import("@/lib/fulfillment/providers/teemill");

const PRODIGI_BASES = ["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"];

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

/** A PAID cart order with one FulfillmentOrder at `status`, one apparel item. */
async function seedFo(status: string, provider = "prodigi", providerOrderId = "p-1") {
  const buyer = await seedUser();
  const seller = await seedUser();
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId: seller.id, sourcingMode: "REFERENCED", title: "Powered By Plants", retailPrice: 32, status: "ACTIVE",
      providerKey: "teemill", providerProductRef: "ref",
    },
  });
  const order = await prisma.order.create({
    data: { buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 32, totalAmount: 36, shippingCountry: "US" },
  });
  const fo = await prisma.fulfillmentOrder.create({
    data: { orderId: order.id, provider, status: status as never, providerOrderId, shippingCost: 0 },
  });
  await prisma.orderItem.create({
    data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1, unitPrice: 32, fulfillmentOrderId: fo.id },
  });
  return { buyer, order, fo };
}

/** Swallow MailerSend so transition email side-effects never make a real call. */
function silenceEmail() {
  server.use(http.post("https://api.mailersend.com/v1/email", () => HttpResponse.json({ id: "e" })));
}

describe("US-MFTF-14.2 — provider status → canonical mapping", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    silenceEmail();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  describe("canonical → DB status reconciliation", () => {
    it("maps PROCESSING→CONFIRMED, ERROR→FAILED, and others 1:1", () => {
      expect(canonicalToDbStatus("PROCESSING")).toBe("CONFIRMED");
      expect(canonicalToDbStatus("PRINTING")).toBe("PRINTING");
      expect(canonicalToDbStatus("SHIPPED")).toBe("SHIPPED");
      expect(canonicalToDbStatus("DELIVERED")).toBe("DELIVERED");
      expect(canonicalToDbStatus("CANCELLED")).toBe("CANCELLED");
      expect(canonicalToDbStatus("ERROR")).toBe("FAILED");
    });
  });

  describe("provider raw status → canonical (mapping lives in the subclass)", () => {
    it("Prodigi maps order stage to the canonical set", async () => {
      const p = new ProdigiFulfillmentProvider();
      server.use(...PRODIGI_BASES.map((b) => http.get(`${b}/orders/:id`, () =>
        HttpResponse.json({ order: { id: "p-1", status: { stage: "InProgress" }, shipments: [] } }))));
      expect((await p.checkFulfillmentStatus({ provider: "prodigi", providerOrderId: "p-1" })).status).toBe("PROCESSING");

      server.use(...PRODIGI_BASES.map((b) => http.get(`${b}/orders/:id`, () =>
        HttpResponse.json({ order: { id: "p-1", status: { stage: "Complete" }, shipments: [{ tracking: { number: "PG-9", carrier: "FedEx" } }] } }))));
      const shipped = await p.checkFulfillmentStatus({ provider: "prodigi", providerOrderId: "p-1" });
      expect(shipped.status).toBe("SHIPPED");
      expect(shipped.trackingNumber).toBe("PG-9");
      expect(shipped.carrier).toBe("FedEx");

      server.use(...PRODIGI_BASES.map((b) => http.get(`${b}/orders/:id`, () =>
        HttpResponse.json({ order: { id: "p-1", status: { stage: "Cancelled" }, shipments: [] } }))));
      expect((await p.checkFulfillmentStatus({ provider: "prodigi", providerOrderId: "p-1" })).status).toBe("CANCELLED");
    });

    it("Prodigi returns null + warns on an unknown stage (no silent transition)", async () => {
      const p = new ProdigiFulfillmentProvider();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      server.use(...PRODIGI_BASES.map((b) => http.get(`${b}/orders/:id`, () =>
        HttpResponse.json({ order: { id: "p-1", status: { stage: "WhoKnows" }, shipments: [] } }))));
      const r = await p.checkFulfillmentStatus({ provider: "prodigi", providerOrderId: "p-1" });
      expect(r.status).toBeNull();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("Teemill maps its dispatched status to SHIPPED with tracking", async () => {
      const t = new TeemillFulfillmentProvider();
      server.use(http.get("https://api.teemill.com/v1/orders/:ref", () =>
        HttpResponse.json({ id: "t-1", status: "dispatched", fulfillments: [{ status: "dispatched", trackingNumber: "TM-1", carrier: "Royal Mail" }] })));
      const r = await t.checkFulfillmentStatus({ provider: "teemill", providerOrderId: "t-1" });
      expect(r.status).toBe("SHIPPED");
      expect(r.trackingNumber).toBe("TM-1");
    });
  });

  describe("applyFulfillmentTransition — monotonic forward guard", () => {
    it("advances PRINTING and persists tracking/carrier on SHIPPED", async () => {
      const { fo } = await seedFo("CONFIRMED");
      const a = await applyFulfillmentTransition(fo.id, "PRINTING", {});
      expect(a.transitioned).toBe(true);
      expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("PRINTING");

      const b = await applyFulfillmentTransition(fo.id, "SHIPPED", { trackingNumber: "T-9", carrier: "DHL" });
      expect(b.transitioned).toBe(true);
      const row = await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } });
      expect(row!.status).toBe("SHIPPED");
      expect(row!.trackingNumber).toBe("T-9");
      expect(row!.carrier).toBe("DHL");
    });

    it("does not regress on a stale earlier-status callback (logged, ignored)", async () => {
      const { fo } = await seedFo("SHIPPED");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const a = await applyFulfillmentTransition(fo.id, "PRINTING", {});
      expect(a.transitioned).toBe(false);
      expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("SHIPPED");
      warn.mockRestore();
    });

    it("is idempotent — a replayed same-status callback transitions at most once", async () => {
      const { fo } = await seedFo("CONFIRMED");
      const first = await applyFulfillmentTransition(fo.id, "SHIPPED", { trackingNumber: "T-1", carrier: "DHL" });
      const second = await applyFulfillmentTransition(fo.id, "SHIPPED", { trackingNumber: "T-1", carrier: "DHL" });
      expect(first.transitioned).toBe(true);
      expect(second.transitioned).toBe(false);
    });
  });

  describe("applyFulfillmentTransition — terminal states", () => {
    it("allows CANCELLED from a non-terminal state, then no-ops once terminal", async () => {
      const { fo } = await seedFo("PRINTING");
      const a = await applyFulfillmentTransition(fo.id, "CANCELLED", {});
      expect(a.transitioned).toBe(true);
      expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("CANCELLED");

      const b = await applyFulfillmentTransition(fo.id, "SHIPPED", { trackingNumber: "T-1", carrier: "X" });
      expect(b.transitioned).toBe(false);
      expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("CANCELLED");
    });

    it("allows ERROR (→FAILED) from a non-terminal state", async () => {
      const { fo } = await seedFo("CONFIRMED");
      const a = await applyFulfillmentTransition(fo.id, "ERROR", {});
      expect(a.transitioned).toBe(true);
      expect((await prisma.fulfillmentOrder.findUnique({ where: { id: fo.id } }))!.status).toBe("FAILED");
    });
  });

  describe("both detection paths feed the same transition contract", () => {
    it("a Prodigi poll and a Teemill poll drive their FOs through identical transitions", async () => {
      const prodigi = await seedFo("CONFIRMED", "prodigi", "p-1");
      const teemill = await seedFo("CONFIRMED", "teemill", "t-1");

      const p = new ProdigiFulfillmentProvider();
      const t = new TeemillFulfillmentProvider();
      server.use(...PRODIGI_BASES.map((b) => http.get(`${b}/orders/:id`, () =>
        HttpResponse.json({ order: { id: "p-1", status: { stage: "Complete" }, shipments: [{ tracking: { number: "PG-1", carrier: "FedEx" } }] } }))));
      server.use(http.get("https://api.teemill.com/v1/orders/:ref", () =>
        HttpResponse.json({ id: "t-1", status: "dispatched", fulfillments: [{ status: "dispatched", trackingNumber: "TM-1", carrier: "Royal Mail" }] })));

      const pr = await p.checkFulfillmentStatus({ provider: "prodigi", providerOrderId: "p-1" });
      const tr = await t.checkFulfillmentStatus({ provider: "teemill", providerOrderId: "t-1" });
      await applyFulfillmentTransition(prodigi.fo.id, pr.status!, { trackingNumber: pr.trackingNumber, carrier: pr.carrier });
      await applyFulfillmentTransition(teemill.fo.id, tr.status!, { trackingNumber: tr.trackingNumber, carrier: tr.carrier });

      expect((await prisma.fulfillmentOrder.findUnique({ where: { id: prodigi.fo.id } }))!.status).toBe("SHIPPED");
      expect((await prisma.fulfillmentOrder.findUnique({ where: { id: teemill.fo.id } }))!.status).toBe("SHIPPED");
    });
  });
});
