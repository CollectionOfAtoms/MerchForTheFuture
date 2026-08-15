import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";

// US-MFTF-17.5 — the admin curation form resolves a pasted Printify catalog URL
// into the blueprint id + the blueprint's stock images + the print providers that
// offer it (the URL carries only the blueprint id; a provider must still be chosen).
// All catalog HTTP via MSW.

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { resolvePrintifyUrlAction } = await import("@/app/actions/admin/product-catalog");
const { auth } = await import("@/auth");

const DETAIL_URL = "https://api.printify.com/v1/catalog/blueprints/:id.json";

describe("US-MFTF-17.5 — resolvePrintifyUrlAction", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("resolves a printify.com product URL into blueprint id, stock images, and providers", async () => {
    const result = await resolvePrintifyUrlAction(
      "https://printify.com/app/products/1580/generic-brand/womens-baby-tee",
    );
    expect("preview" in result).toBe(true);
    if (!("preview" in result)) return;
    expect(result.preview.blueprintId).toBe(1580);
    expect(result.preview.title).toBe("Women's Baby Tee");
    expect(result.preview.images.length).toBeGreaterThan(0);
    expect(result.preview.providers).toContainEqual({ id: 99, title: "Printify Choice" });
  });

  it("accepts a bare blueprint id too", async () => {
    const result = await resolvePrintifyUrlAction("1580");
    expect("preview" in result && result.preview.blueprintId).toBe(1580);
  });

  it("errors on input with no recognisable blueprint id", async () => {
    const result = await resolvePrintifyUrlAction("https://example.com/not-printify");
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("errors when Printify does not recognise the blueprint", async () => {
    server.use(http.get(DETAIL_URL, () => HttpResponse.json({ message: "not found" }, { status: 404 })));
    const result = await resolvePrintifyUrlAction("999999");
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("rejects a non-admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u-1", roles: ["BUYER"] } } as never);
    const result = await resolvePrintifyUrlAction("1580");
    expect(result).toMatchObject({ error: "Unauthorized" });
  });
});
