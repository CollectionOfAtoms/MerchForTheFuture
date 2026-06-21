import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// US-MFTF-16.1 — designed product types are Prodigi-only. The server action
// rejects TEEMILL (guarding stale/direct calls); the enum still retains TEEMILL
// (no migration), so existing rows are created directly via prisma in fixtures.

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { createProductTypeAction, updateProductTypeAction } = await import(
  "@/app/actions/admin/product-catalog"
);
const { auth } = await import("@/auth");

function makeForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", overrides.name ?? "Designed Tee");
  fd.set("description", overrides.description ?? "A designed tee");
  fd.set("fulfillmentProvider", overrides.fulfillmentProvider ?? "PRODIGI");
  fd.set("providerSkuBase", overrides.providerSkuBase ?? "GLOBAL-TEE-1");
  if (overrides.isActive !== undefined) fd.set("isActive", overrides.isActive);
  return fd;
}

describe("US-MFTF-16.1 — createProductTypeAction rejects TEEMILL", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("rejects creating a designed product type with TEEMILL and creates no row", async () => {
    const result = await createProductTypeAction(makeForm({ fulfillmentProvider: "TEEMILL" }));
    expect(result).toMatchObject({ error: expect.any(String) });
    const count = await prisma.productType.count({ where: { name: "Designed Tee" } });
    expect(count).toBe(0);
  });

  it("still creates a Prodigi designed product type", async () => {
    const result = await createProductTypeAction(makeForm({ fulfillmentProvider: "PRODIGI" }));
    expect(result).toMatchObject({ id: expect.any(String) });
    const pt = await prisma.productType.findUnique({ where: { name: "Designed Tee" } });
    expect(pt!.fulfillmentProvider).toBe("PRODIGI");
  });
});

describe("US-MFTF-16.1 — updateProductTypeAction rejects TEEMILL", () => {
  let productTypeId: string;

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
    const pt = await prisma.productType.create({
      data: { name: "Designed Tee", fulfillmentProvider: "PRODIGI", providerSkuBase: "GLOBAL-TEE-1" },
    });
    productTypeId = pt.id;
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("rejects updating a product type to TEEMILL", async () => {
    const result = await updateProductTypeAction(
      productTypeId,
      makeForm({ fulfillmentProvider: "TEEMILL" }),
    );
    expect(result).toMatchObject({ error: expect.any(String) });
    const pt = await prisma.productType.findUnique({ where: { id: productTypeId } });
    expect(pt!.fulfillmentProvider).toBe("PRODIGI");
  });

  it("still updates a Prodigi designed product type", async () => {
    const result = await updateProductTypeAction(
      productTypeId,
      makeForm({ name: "Renamed Tee", fulfillmentProvider: "PRODIGI" }),
    );
    expect(result).toMatchObject({ id: productTypeId });
    const pt = await prisma.productType.findUnique({ where: { id: productTypeId } });
    expect(pt!.name).toBe("Renamed Tee");
  });
});
