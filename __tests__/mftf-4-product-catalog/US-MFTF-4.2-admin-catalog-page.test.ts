import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { getAdminProductCatalog } = await import("@/lib/admin/product-catalog");
const { auth } = await import("@/auth");

// ─── US-MFTF-4.2 — Admin Product Catalog Page ────────────────────────────────

describe("US-MFTF-4.2 — getAdminProductCatalog data layer", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it("returns all product types including inactive ones", async () => {
    await prisma.productType.create({
      data: {
        name: "Unisex Tee",
        fulfillmentProvider: "TEEMILL",
        providerSkuBase: "RNA1",
        colors: { create: [{ colorName: "White",
 providerColorCode: "White" }] },
        sizes:  { create: [{ sizeLabel: "M", providerSizeCode: "M", sortOrder: 2 }] },
      },
    });
    await prisma.productType.create({
      data: {
        name: "Discontinued Item",
        fulfillmentProvider: "TEEMILL",
        providerSkuBase: "OLD1",
      },
    });

    const result = await getAdminProductCatalog();

    expect(result).toHaveLength(2);
  });

  it("returns product types with correct name and fulfillmentProvider fields", async () => {
    await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });

    const [pt] = await getAdminProductCatalog();

    expect(pt.name).toBe("Unisex Tee");
    expect(pt.fulfillmentProvider).toBe("TEEMILL");
  });

  it("includes color count and size count per product type", async () => {
    await prisma.productType.create({
      data: {
        name: "Unisex Tee",
        fulfillmentProvider: "TEEMILL",
        providerSkuBase: "RNA1",
        colors: {
          create: [
            { colorName: "White",
 providerColorCode: "White" },
            { colorName: "Black",
 providerColorCode: "Black" },
            { colorName: "Retired",
 providerColorCode: "Retired" },
          ],
        },
        sizes: {
          create: [
            { sizeLabel: "S",   providerSizeCode: "S",   sortOrder: 1 },
            { sizeLabel: "M",   providerSizeCode: "M",   sortOrder: 2 },
            { sizeLabel: "Old", providerSizeCode: "Old", sortOrder: 9 },
          ],
        },
      },
    });

    const [pt] = await getAdminProductCatalog();

    expect(pt.activeColorCount).toBe(3);
    expect(pt.activeSizeCount).toBe(3);
  });

  it("returns product types ordered by name ascending", async () => {
    await prisma.productType.create({
      data: { name: "Tote Bag", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNT1" },
    });
    await prisma.productType.create({
      data: { name: "Art Print", fulfillmentProvider: "PRODIGI", providerSkuBase: "GLOBAL-FAP" },
    });
    await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });

    const result = await getAdminProductCatalog();

    expect(result.map((r) => r.name)).toEqual(["Art Print", "Tote Bag", "Unisex Tee"]);
  });

  it("returns empty array when no product types exist", async () => {
    const result = await getAdminProductCatalog();
    expect(result).toHaveLength(0);
  });
});

describe("US-MFTF-4.2 — /admin/products auth guard", () => {
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("redirects unauthenticated users to /sign-in", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const { AdminProductsPage } = await import("@/app/(main)/admin/products/page");

    await expect(AdminProductsPage()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
  });

  it("redirects non-admin authenticated users to /", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "buyer-1", roles: ["BUYER"] } } as never);
    const { AdminProductsPage } = await import("@/app/(main)/admin/products/page");

    await expect(AdminProductsPage()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("renders for admin users without redirecting", async () => {
    await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });

    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
    const { AdminProductsPage } = await import("@/app/(main)/admin/products/page");

    await expect(AdminProductsPage()).resolves.not.toThrow();
  });
});
