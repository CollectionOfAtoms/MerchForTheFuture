import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { applyFulfillmentTransition } = await import("@/lib/fulfillment/status");

async function seedUser() {
  return prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@example.com`, roles: ["BUYER"] } });
}

/** Capture every MailerSend send (subject + html body) in the current test. */
function captureEmails(): { sends: Array<{ subject: string; html: string; to: string }> } {
  const sends: Array<{ subject: string; html: string; to: string }> = [];
  server.use(
    http.post("https://api.mailersend.com/v1/email", async ({ request }) => {
      const body = (await request.json()) as { subject: string; html: string; to: Array<{ email: string }> };
      sends.push({ subject: body.subject, html: body.html, to: body.to[0]?.email });
      return HttpResponse.json({ id: "e" });
    }),
  );
  return { sends };
}

/** A PAID cart order with `n` CONFIRMED FulfillmentOrders, one apparel item each. */
async function seedOrder(n: number) {
  const buyer = await seedUser();
  const seller = await seedUser();
  const order = await prisma.order.create({
    data: { buyerId: buyer.id, listingType: "CART", status: "PAID", subtotal: 32, totalAmount: 36, shippingCountry: "US" },
  });
  const fos = [];
  for (let i = 0; i < n; i++) {
    const listing = await prisma.apparelListing.create({
      data: { sellerId: seller.id, sourcingMode: "REFERENCED", title: `Tee ${i}`, retailPrice: 32, status: "ACTIVE", providerKey: "teemill", providerProductRef: "ref" },
    });
    const fo = await prisma.fulfillmentOrder.create({
      data: { orderId: order.id, provider: "teemill", status: "CONFIRMED", providerOrderId: `t-${i}`, shippingCost: 0 },
    });
    await prisma.orderItem.create({
      data: { orderId: order.id, itemKind: "APPAREL", apparelListingId: listing.id, selection: { colorId: "Evergreen", sizeLabel: "M" }, quantity: 1, unitPrice: 32, fulfillmentOrderId: fo.id },
    });
    fos.push(fo);
  }
  return { buyer, order, fos };
}

describe("US-MFTF-14.3 — buyer lifecycle emails", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  it("sends one email per transition with the right subject (PRINTING/SHIPPED/DELIVERED)", async () => {
    const { buyer, fos } = await seedOrder(1);
    const { sends } = captureEmails();

    await applyFulfillmentTransition(fos[0].id, "PRINTING", {});
    await applyFulfillmentTransition(fos[0].id, "SHIPPED", { trackingNumber: "TM-1", carrier: "Royal Mail" });
    await applyFulfillmentTransition(fos[0].id, "DELIVERED", {});

    expect(sends).toHaveLength(3);
    expect(sends[0].subject.toLowerCase()).toContain("printed");
    expect(sends[1].subject.toLowerCase()).toContain("on its way");
    expect(sends[1].html).toContain("TM-1");
    expect(sends[1].html).toContain("Royal Mail");
    expect(sends[2].subject.toLowerCase()).toContain("delivered");
    sends.forEach((s) => expect(s.to).toBe(buyer.email));
  });

  it("never names the provider/dropshipper in any email", async () => {
    const { fos } = await seedOrder(1);
    const { sends } = captureEmails();
    await applyFulfillmentTransition(fos[0].id, "PRINTING", {});
    await applyFulfillmentTransition(fos[0].id, "SHIPPED", { trackingNumber: "TM-1", carrier: "X" });
    const all = JSON.stringify(sends).toLowerCase();
    expect(all).not.toContain("teemill");
    expect(all).not.toContain("prodigi");
  });

  it("is idempotent — a replayed SHIPPED transition emails exactly once", async () => {
    const { fos } = await seedOrder(1);
    const { sends } = captureEmails();
    await applyFulfillmentTransition(fos[0].id, "SHIPPED", { trackingNumber: "TM-1", carrier: "X" });
    await applyFulfillmentTransition(fos[0].id, "SHIPPED", { trackingNumber: "TM-1", carrier: "X" });
    expect(sends.filter((s) => s.subject.toLowerCase().includes("on its way"))).toHaveLength(1);
  });

  it("emails per shipment — a two-shipment order produces independent SHIPPED emails labelled 'Shipment N of 2'", async () => {
    const { fos } = await seedOrder(2);
    const { sends } = captureEmails();
    await applyFulfillmentTransition(fos[0].id, "SHIPPED", { trackingNumber: "A", carrier: "X" });
    await applyFulfillmentTransition(fos[1].id, "SHIPPED", { trackingNumber: "B", carrier: "Y" });
    expect(sends).toHaveLength(2);
    const subjects = sends.map((s) => s.subject);
    expect(subjects.some((s) => s.includes("Shipment 1 of 2"))).toBe(true);
    expect(subjects.some((s) => s.includes("Shipment 2 of 2"))).toBe(true);
  });

  it("on a MailerSend failure: logs the error and NEVER rolls back the status transition", async () => {
    const { fos } = await seedOrder(1);
    server.use(http.post("https://api.mailersend.com/v1/email", () => new HttpResponse(null, { status: 500 })));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await applyFulfillmentTransition(fos[0].id, "SHIPPED", { trackingNumber: "TM-1", carrier: "X" });

    expect(result.transitioned).toBe(true);
    const row = await prisma.fulfillmentOrder.findUnique({ where: { id: fos[0].id } });
    expect(row!.status).toBe("SHIPPED"); // persisted despite the email failure
    expect(row!.trackingNumber).toBe("TM-1");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
