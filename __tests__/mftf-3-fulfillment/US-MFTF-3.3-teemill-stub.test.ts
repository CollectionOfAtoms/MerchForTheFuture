import { describe, it, expect, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// No DB, no external calls — pure unit tests on the stub provider.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { TeemillFulfillmentProvider } = await import("@/lib/fulfillment/providers/teemill");
const { getFulfillmentProvider } = await import("@/lib/fulfillment/index");

// ─── US-MFTF-3.3 — Stub T-Mill Provider ──────────────────────────────────────

describe("US-MFTF-3.3 — TeemillFulfillmentProvider stub", () => {
  const baseParams = {
    listingRef: "listing-abc",
    colorVariantId: "/v1/variants/mock-uuid",
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
  };

  // ── Identity ────────────────────────────────────────────────────────────

  it("has a name property", () => {
    const provider = new TeemillFulfillmentProvider();
    expect(typeof provider.name).toBe("string");
    expect(provider.name.length).toBeGreaterThan(0);
  });

  it("getFulfillmentProvider('APPAREL') returns a TeemillFulfillmentProvider", () => {
    const provider = getFulfillmentProvider("APPAREL");
    expect(provider).toBeInstanceOf(TeemillFulfillmentProvider);
  });

  // ── createOrder throws NotImplemented ────────────────────────────────────

  it("createOrder throws an error rather than silently failing", async () => {
    const provider = new TeemillFulfillmentProvider();
    await expect(provider.createOrder(baseParams)).rejects.toThrow();
  });

  it("createOrder error message identifies it as TeemillFulfillmentProvider", async () => {
    const provider = new TeemillFulfillmentProvider();
    await expect(provider.createOrder(baseParams)).rejects.toThrow(
      /TeemillFulfillmentProvider/
    );
  });

  it("createOrder error message indicates not yet implemented", async () => {
    const provider = new TeemillFulfillmentProvider();
    await expect(provider.createOrder(baseParams)).rejects.toThrow(
      /not yet implemented/i
    );
  });

  // ── getOrderStatus throws NotImplemented ─────────────────────────────────

  it("getOrderStatus throws an error rather than silently failing", async () => {
    const provider = new TeemillFulfillmentProvider();
    await expect(provider.getOrderStatus("ext-order-123")).rejects.toThrow();
  });

  it("getOrderStatus error message identifies it as TeemillFulfillmentProvider", async () => {
    const provider = new TeemillFulfillmentProvider();
    await expect(provider.getOrderStatus("ext-order-123")).rejects.toThrow(
      /TeemillFulfillmentProvider/
    );
  });

  it("getOrderStatus error message indicates not yet implemented", async () => {
    const provider = new TeemillFulfillmentProvider();
    await expect(provider.getOrderStatus("ext-order-123")).rejects.toThrow(
      /not yet implemented/i
    );
  });

  // ── Does not make any network calls ─────────────────────────────────────

  it("createOrder does not make any HTTP calls before throwing", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const provider = new TeemillFulfillmentProvider();

    await expect(provider.createOrder(baseParams)).rejects.toThrow();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
