import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const {
  createProductTypeAction,
  updateProductTypeAction,
  addProductTypeColorAction,
  toggleProductTypeColorAction,
  addProductTypeSizeAction,
  toggleProductTypeSizeAction,
} = await import("@/app/actions/admin/product-catalog");
const { auth } = await import("@/auth");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProductTypeForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name",                overrides.name                ?? "Unisex Tee");
  fd.set("description",         overrides.description         ?? "Great tee");
  fd.set("fulfillmentProvider", overrides.fulfillmentProvider ?? "TEEMILL");
  fd.set("providerSkuBase",     overrides.providerSkuBase     ?? "RNA1");
  fd.set("isActive",            overrides.isActive            ?? "true");
  return fd;
}

function makeColorForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("colorName",         overrides.colorName         ?? "White");
  fd.set("colorHex",          overrides.colorHex          ?? "#FFFFFF");
  fd.set("providerColorCode", overrides.providerColorCode ?? "White");
  return fd;
}

function makeSizeForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("sizeLabel",        overrides.sizeLabel        ?? "M");
  fd.set("providerSizeCode", overrides.providerSizeCode ?? "M");
  fd.set("sortOrder",        overrides.sortOrder        ?? "2");
  return fd;
}

// ─── createProductTypeAction ──────────────────────────────────────────────────

describe("US-MFTF-4.3 — createProductTypeAction", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns Unauthorized when called without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const result = await createProductTypeAction(makeProductTypeForm());
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns Unauthorized when called by a non-admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "buyer-1", roles: ["BUYER"] } } as never);
    const result = await createProductTypeAction(makeProductTypeForm());
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns validation error when name is missing", async () => {
    const result = await createProductTypeAction(makeProductTypeForm({ name: "" }));
    expect(result).toMatchObject({ error: expect.stringContaining("name") });
  });

  it("returns validation error when providerSkuBase is missing", async () => {
    const result = await createProductTypeAction(makeProductTypeForm({ providerSkuBase: "" }));
    expect(result).toMatchObject({ error: expect.stringContaining("SKU") });
  });

  it("returns validation error when fulfillmentProvider is invalid", async () => {
    const result = await createProductTypeAction(makeProductTypeForm({ fulfillmentProvider: "INVALID" }));
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("returns validation error when name is already taken", async () => {
    await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    const result = await createProductTypeAction(makeProductTypeForm({ name: "Unisex Tee" }));
    expect(result).toMatchObject({ error: expect.stringContaining("already exists") });
  });

  it("creates a product type and returns its id on success", async () => {
    const result = await createProductTypeAction(makeProductTypeForm());
    expect(result).toMatchObject({ id: expect.any(String) });

    const pt = await prisma.productType.findUnique({ where: { name: "Unisex Tee" } });
    expect(pt).not.toBeNull();
    expect(pt!.fulfillmentProvider).toBe("TEEMILL");
    expect(pt!.providerSkuBase).toBe("RNA1");
    expect(pt!.isActive).toBe(true);
  });

  it("creates an inactive product type when isActive is false", async () => {
    await createProductTypeAction(makeProductTypeForm({ isActive: "false" }));
    const pt = await prisma.productType.findUnique({ where: { name: "Unisex Tee" } });
    expect(pt!.isActive).toBe(false);
  });
});

// ─── updateProductTypeAction ──────────────────────────────────────────────────

describe("US-MFTF-4.3 — updateProductTypeAction", () => {
  let productTypeId: string;

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
    const pt = await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    productTypeId = pt.id;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns Unauthorized when called by a non-admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "buyer-1", roles: ["BUYER"] } } as never);
    const result = await updateProductTypeAction(productTypeId, makeProductTypeForm());
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns not found when product type id does not exist", async () => {
    const result = await updateProductTypeAction("nonexistent-id", makeProductTypeForm());
    expect(result).toMatchObject({ error: expect.stringContaining("not found") });
  });

  it("updates name, description, providerSkuBase, and isActive", async () => {
    await updateProductTypeAction(
      productTypeId,
      makeProductTypeForm({ name: "Updated Tee", description: "Updated", providerSkuBase: "RNA2", isActive: "false" })
    );

    const pt = await prisma.productType.findUnique({ where: { id: productTypeId } });
    expect(pt!.name).toBe("Updated Tee");
    expect(pt!.description).toBe("Updated");
    expect(pt!.providerSkuBase).toBe("RNA2");
    expect(pt!.isActive).toBe(false);
  });

  it("returns validation error when activating a product type with no active colors or sizes", async () => {
    await prisma.productType.update({ where: { id: productTypeId }, data: { isActive: false } });
    const result = await updateProductTypeAction(
      productTypeId,
      makeProductTypeForm({ isActive: "true" })
    );
    expect(result).toMatchObject({ error: expect.stringContaining("color") });
  });

  it("allows activating a product type that has at least one active color and one active size", async () => {
    await prisma.productType.update({ where: { id: productTypeId }, data: { isActive: false } });
    await prisma.productTypeColor.create({
      data: { productTypeId, colorName: "White", colorHex: "#FFF", providerColorCode: "White" },
    });
    await prisma.productTypeSizeOption.create({
      data: { productTypeId, sizeLabel: "M", providerSizeCode: "M", sortOrder: 2 },
    });

    const result = await updateProductTypeAction(
      productTypeId,
      makeProductTypeForm({ isActive: "true" })
    );
    expect(result).toMatchObject({ id: productTypeId });
  });

  it("returns validation error on duplicate name (another product type already has that name)", async () => {
    await prisma.productType.create({
      data: { name: "Tote Bag", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNT1" },
    });
    const result = await updateProductTypeAction(
      productTypeId,
      makeProductTypeForm({ name: "Tote Bag" })
    );
    expect(result).toMatchObject({ error: expect.stringContaining("already exists") });
  });
});

// ─── addProductTypeColorAction ────────────────────────────────────────────────

describe("US-MFTF-4.3 — addProductTypeColorAction", () => {
  let productTypeId: string;

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
    const pt = await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    productTypeId = pt.id;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns Unauthorized for non-admins", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "buyer-1", roles: ["BUYER"] } } as never);
    const result = await addProductTypeColorAction(productTypeId, makeColorForm());
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("adds a color to a product type", async () => {
    const result = await addProductTypeColorAction(productTypeId, makeColorForm());
    expect(result).toMatchObject({ id: expect.any(String) });

    const colors = await prisma.productTypeColor.findMany({ where: { productTypeId } });
    expect(colors).toHaveLength(1);
    expect(colors[0].colorName).toBe("White");
  });

  it("returns validation error when colorName is missing", async () => {
    const result = await addProductTypeColorAction(productTypeId, makeColorForm({ colorName: "" }));
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("returns not found when product type does not exist", async () => {
    const result = await addProductTypeColorAction("bad-id", makeColorForm());
    expect(result).toMatchObject({ error: expect.stringContaining("not found") });
  });
});

// ─── toggleProductTypeColorAction ────────────────────────────────────────────

describe("US-MFTF-4.3 — toggleProductTypeColorAction", () => {
  let colorId: string;

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
    const pt = await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    const color = await prisma.productTypeColor.create({
      data: { productTypeId: pt.id, colorName: "White", colorHex: "#FFF", providerColorCode: "White" },
    });
    colorId = color.id;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns Unauthorized for non-admins", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "buyer-1", roles: ["BUYER"] } } as never);
    const result = await toggleProductTypeColorAction(colorId, false);
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("deactivates an active color", async () => {
    await toggleProductTypeColorAction(colorId, false);
    const color = await prisma.productTypeColor.findUnique({ where: { id: colorId } });
    expect(color!.isActive).toBe(false);
  });

  it("activates an inactive color", async () => {
    await prisma.productTypeColor.update({ where: { id: colorId }, data: { isActive: false } });
    await toggleProductTypeColorAction(colorId, true);
    const color = await prisma.productTypeColor.findUnique({ where: { id: colorId } });
    expect(color!.isActive).toBe(true);
  });
});

// ─── addProductTypeSizeAction ─────────────────────────────────────────────────

describe("US-MFTF-4.3 — addProductTypeSizeAction", () => {
  let productTypeId: string;

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
    const pt = await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    productTypeId = pt.id;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns Unauthorized for non-admins", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "buyer-1", roles: ["BUYER"] } } as never);
    const result = await addProductTypeSizeAction(productTypeId, makeSizeForm());
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("adds a size option to a product type", async () => {
    const result = await addProductTypeSizeAction(productTypeId, makeSizeForm());
    expect(result).toMatchObject({ id: expect.any(String) });

    const sizes = await prisma.productTypeSizeOption.findMany({ where: { productTypeId } });
    expect(sizes).toHaveLength(1);
    expect(sizes[0].sizeLabel).toBe("M");
    expect(sizes[0].sortOrder).toBe(2);
  });

  it("returns validation error when sizeLabel is missing", async () => {
    const result = await addProductTypeSizeAction(productTypeId, makeSizeForm({ sizeLabel: "" }));
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("returns not found when product type does not exist", async () => {
    const result = await addProductTypeSizeAction("bad-id", makeSizeForm());
    expect(result).toMatchObject({ error: expect.stringContaining("not found") });
  });
});

// ─── toggleProductTypeSizeAction ─────────────────────────────────────────────

describe("US-MFTF-4.3 — toggleProductTypeSizeAction", () => {
  let sizeId: string;

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
    const pt = await prisma.productType.create({
      data: { name: "Unisex Tee", fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
    });
    const size = await prisma.productTypeSizeOption.create({
      data: { productTypeId: pt.id, sizeLabel: "M", providerSizeCode: "M", sortOrder: 2 },
    });
    sizeId = size.id;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns Unauthorized for non-admins", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "buyer-1", roles: ["BUYER"] } } as never);
    const result = await toggleProductTypeSizeAction(sizeId, false);
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("deactivates an active size", async () => {
    await toggleProductTypeSizeAction(sizeId, false);
    const size = await prisma.productTypeSizeOption.findUnique({ where: { id: sizeId } });
    expect(size!.isActive).toBe(false);
  });

  it("activates an inactive size", async () => {
    await prisma.productTypeSizeOption.update({ where: { id: sizeId }, data: { isActive: false } });
    await toggleProductTypeSizeAction(sizeId, true);
    const size = await prisma.productTypeSizeOption.findUnique({ where: { id: sizeId } });
    expect(size!.isActive).toBe(true);
  });
});
