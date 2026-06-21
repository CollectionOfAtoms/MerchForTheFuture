import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { prisma, resetDatabase } from "../helpers/db";

// BUG-16 — a designed product type whose providerSkuBase is not a real Prodigi
// catalog SKU must be rejected at submit time (GET /products/{sku} → non-200);
// the seller is told and no ProductType row is created.

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { createProductTypeAction, updateProductTypeAction } = await import(
  "@/app/actions/admin/product-catalog"
);
const { auth } = await import("@/auth");

const PRODIGI_BASES = ["https://api.prodigi.com/v4.0", "https://api.sandbox.prodigi.com/v4.0"];

/** Override product-details: known SKUs 200, everything else 404. */
function stubKnownSkus(known: string[]) {
  server.use(
    ...PRODIGI_BASES.map((base) =>
      http.get(`${base}/products/:sku`, ({ params }) => {
        const sku = String(params.sku);
        if (known.includes(sku)) {
          return HttpResponse.json({ product: { sku, attributes: {}, variants: [] } });
        }
        return HttpResponse.json({ message: "not found" }, { status: 404 });
      }),
    ),
  );
}

function makeForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", overrides.name ?? "Designed Tee");
  fd.set("description", overrides.description ?? "");
  fd.set("fulfillmentProvider", overrides.fulfillmentProvider ?? "PRODIGI");
  fd.set("providerSkuBase", overrides.providerSkuBase ?? "GLOBAL-TEE-REAL");
  if (overrides.isActive !== undefined) fd.set("isActive", overrides.isActive);
  return fd;
}

describe("BUG-16 — createProductTypeAction rejects an invalid Prodigi SKU", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("rejects a SKU Prodigi does not recognise and creates no row", async () => {
    stubKnownSkus(["GLOBAL-TEE-REAL"]);
    const result = await createProductTypeAction(makeForm({ providerSkuBase: "NOT-A-REAL-SKU" }));
    expect(result).toMatchObject({ error: expect.stringContaining("NOT-A-REAL-SKU") });
    expect(await prisma.productType.count({ where: { name: "Designed Tee" } })).toBe(0);
  });

  it("creates the product type when the SKU is valid", async () => {
    stubKnownSkus(["GLOBAL-TEE-REAL"]);
    const result = await createProductTypeAction(makeForm({ providerSkuBase: "GLOBAL-TEE-REAL" }));
    expect(result).toMatchObject({ id: expect.any(String) });
    expect(await prisma.productType.count({ where: { name: "Designed Tee" } })).toBe(1);
  });
});

describe("BUG-16 — updateProductTypeAction rejects an invalid Prodigi SKU", () => {
  let productTypeId: string;

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
    const pt = await prisma.productType.create({
      data: { name: "Designed Tee", fulfillmentProvider: "PRODIGI", providerSkuBase: "GLOBAL-TEE-REAL" },
    });
    productTypeId = pt.id;
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("rejects updating to a SKU Prodigi does not recognise and leaves the row unchanged", async () => {
    stubKnownSkus(["GLOBAL-TEE-REAL"]);
    const result = await updateProductTypeAction(
      productTypeId,
      makeForm({ providerSkuBase: "NOT-A-REAL-SKU" }),
    );
    expect(result).toMatchObject({ error: expect.stringContaining("NOT-A-REAL-SKU") });
    const pt = await prisma.productType.findUnique({ where: { id: productTypeId } });
    expect(pt!.providerSkuBase).toBe("GLOBAL-TEE-REAL");
  });
});
