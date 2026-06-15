import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { createApparelListingAction } = await import("@/app/actions/apparel");
const { getActiveProductTypesForListing } = await import("@/lib/apparel/listings");
const { auth } = await import("@/auth");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedSeller(roles: string[] = ["SELLER"]) {
  return prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: roles as never },
  });
}

async function seedProductType({ isActive = true } = {}) {
  return prisma.productType.create({
    data: {
      name: `Unisex Tee ${crypto.randomUUID()}`,
      description: "Soft organic cotton tee",
      fulfillmentProvider: "TEEMILL",
      providerSkuBase: "RNA1",
      isActive,
      colors: {
        create: [
          { colorName: "White", providerColorCode: "White", colorImageUrl: "https://img/white.jpg" },
          { colorName: "Black", providerColorCode: "Black", colorImageUrl: "https://img/black.jpg" },
          { colorName: "Forest", providerColorCode: "Forest", colorImageUrl: "https://img/forest.jpg" },
        ],
      },
      sizes: {
        create: [
          { sizeLabel: "S", providerSizeCode: "S", sortOrder: 1 },
          { sizeLabel: "M", providerSizeCode: "M", sortOrder: 2 },
          { sizeLabel: "L", providerSizeCode: "L", sortOrder: 3 },
        ],
      },
    },
    include: { colors: true, sizes: true },
  });
}

function makeForm(fields: {
  productTypeId?: string;
  title?: string;
  description?: string;
  retailPrice?: string;
  designImageUrl?: string;
  intent?: string;
  colorIds?: string[];
  lifestyleUrls?: string[];
}): FormData {
  const fd = new FormData();
  if (fields.productTypeId !== undefined) fd.set("productTypeId", fields.productTypeId);
  if (fields.title !== undefined) fd.set("title", fields.title);
  if (fields.description !== undefined) fd.set("description", fields.description);
  if (fields.retailPrice !== undefined) fd.set("retailPrice", fields.retailPrice);
  if (fields.designImageUrl !== undefined) fd.set("designImageUrl", fields.designImageUrl);
  if (fields.intent !== undefined) fd.set("intent", fields.intent);
  for (const id of fields.colorIds ?? []) fd.append("offeredColorId", id);
  for (const url of fields.lifestyleUrls ?? []) fd.append("lifestyleImageUrl", url);
  return fd;
}

/** Run the action, returning either its result object or the redirect URL it threw. */
async function submit(fd: FormData): Promise<{ result?: unknown; redirect?: string }> {
  try {
    return { result: await createApparelListingAction(undefined, fd) };
  } catch (e) {
    return { redirect: (e as Error).message };
  }
}

function validForm(pt: Awaited<ReturnType<typeof seedProductType>>, overrides: Partial<Parameters<typeof makeForm>[0]> = {}) {
  return makeForm({
    productTypeId: pt.id,
    title: "Solar Punk Bee",
    description: "A hopeful tee",
    retailPrice: "28",
    designImageUrl: "https://blob.vercel.com/apparel/design/clean.png",
    intent: "publish",
    colorIds: [pt.colors[0].id, pt.colors[1].id],
    lifestyleUrls: ["https://blob.vercel.com/apparel/ls/a.jpg"],
    ...overrides,
  });
}

// ─── createApparelListingAction — auth ────────────────────────────────────────

describe("US-MFTF-5.3 — createApparelListingAction auth guard", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("returns Unauthorized when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const pt = await seedProductType();
    const { result } = await submit(validForm(pt));
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("returns Unauthorized when the user is not a seller", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "buyer-1", roles: ["BUYER"] } } as never);
    const pt = await seedProductType();
    const { result } = await submit(validForm(pt));
    expect(result).toEqual({ error: "Unauthorized" });
  });
});

// ─── createApparelListingAction — validation ──────────────────────────────────

describe("US-MFTF-5.3 — createApparelListingAction validation", () => {
  let seller: Awaited<ReturnType<typeof seedSeller>>;

  beforeEach(async () => {
    await resetDatabase();
    seller = await seedSeller();
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("rejects a missing title", async () => {
    const pt = await seedProductType();
    const { result } = await submit(validForm(pt, { title: "" }));
    expect(result).toMatchObject({ error: expect.stringMatching(/title/i) });
  });

  it("rejects a missing product type", async () => {
    const { result } = await submit(validForm(await seedProductType(), { productTypeId: "" }));
    expect(result).toMatchObject({ error: expect.stringMatching(/product type/i) });
  });

  it("rejects a non-existent product type", async () => {
    const pt = await seedProductType();
    const { result } = await submit(validForm(pt, { productTypeId: "does-not-exist" }));
    expect(result).toMatchObject({ error: expect.stringMatching(/product type/i) });
  });

  it("rejects an inactive product type", async () => {
    const pt = await seedProductType({ isActive: false });
    const { result } = await submit(validForm(pt));
    expect(result).toMatchObject({ error: expect.stringMatching(/product type/i) });
  });

  it("rejects a missing design file", async () => {
    const pt = await seedProductType();
    const { result } = await submit(validForm(pt, { designImageUrl: "" }));
    expect(result).toMatchObject({ error: expect.stringMatching(/design/i) });
  });

  it("rejects a retail price below $1", async () => {
    const pt = await seedProductType();
    const { result } = await submit(validForm(pt, { retailPrice: "0.50" }));
    expect(result).toMatchObject({ error: expect.stringMatching(/price/i) });
  });

  it("rejects when no colors are selected", async () => {
    const pt = await seedProductType();
    const { result } = await submit(validForm(pt, { colorIds: [] }));
    expect(result).toMatchObject({ error: expect.stringMatching(/color/i) });
  });

  it("rejects a color that does not belong to the product type", async () => {
    const pt = await seedProductType();
    const other = await seedProductType();
    const { result } = await submit(validForm(pt, { colorIds: [pt.colors[0].id, other.colors[0].id] }));
    expect(result).toMatchObject({ error: expect.stringMatching(/color/i) });
  });

  it("rejects more than 10 lifestyle photos", async () => {
    const pt = await seedProductType();
    const urls = Array.from({ length: 11 }, (_, i) => `https://blob.vercel.com/apparel/ls/${i}.jpg`);
    const { result } = await submit(validForm(pt, { lifestyleUrls: urls }));
    expect(result).toMatchObject({ error: expect.stringMatching(/10/) });
  });
});

// ─── createApparelListingAction — success ─────────────────────────────────────

describe("US-MFTF-5.3 — createApparelListingAction success", () => {
  let seller: Awaited<ReturnType<typeof seedSeller>>;

  beforeEach(async () => {
    await resetDatabase();
    seller = await seedSeller();
    vi.mocked(auth).mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("creates an ACTIVE listing when published and redirects to the edit page", async () => {
    const pt = await seedProductType();
    const { redirect } = await submit(validForm(pt, { intent: "publish" }));
    const listing = await prisma.apparelListing.findFirst({ where: { sellerId: seller.id } });
    expect(listing).not.toBeNull();
    expect(listing!.status).toBe("ACTIVE");
    expect(listing!.title).toBe("Solar Punk Bee");
    expect(Number(listing!.retailPrice)).toBe(28);
    expect(listing!.productTypeId).toBe(pt.id);
    expect(redirect).toContain(`/seller/apparel/${listing!.id}/edit`);
  });

  it("stores the clean design file URL verbatim (no watermark, no processing)", async () => {
    const pt = await seedProductType();
    await submit(validForm(pt, { designImageUrl: "https://blob.vercel.com/apparel/design/clean.png" }));
    const listing = await prisma.apparelListing.findFirst({ where: { sellerId: seller.id } });
    expect(listing!.designImageUrl).toBe("https://blob.vercel.com/apparel/design/clean.png");
  });

  it("creates an UNLISTED listing when saved as a draft (viewable by link, hidden from feeds)", async () => {
    const pt = await seedProductType();
    await submit(validForm(pt, { intent: "draft" }));
    const listing = await prisma.apparelListing.findFirst({ where: { sellerId: seller.id } });
    expect(listing!.status).toBe("UNLISTED");
  });

  it("creates ApparelListingColor rows only for the offered colors", async () => {
    const pt = await seedProductType();
    await submit(validForm(pt, { colorIds: [pt.colors[0].id, pt.colors[1].id] }));
    const listing = await prisma.apparelListing.findFirst({
      where: { sellerId: seller.id },
      include: { colors: true },
    });
    expect(listing!.colors).toHaveLength(2);
    expect(listing!.colors.every((c) => c.isOffered)).toBe(true);
    const offeredIds = listing!.colors.map((c) => c.productTypeColorId).sort();
    expect(offeredIds).toEqual([pt.colors[0].id, pt.colors[1].id].sort());
  });

  it("creates ApparelListingImage rows for lifestyle photos with primary + order", async () => {
    const pt = await seedProductType();
    await submit(validForm(pt, {
      lifestyleUrls: [
        "https://blob.vercel.com/apparel/ls/a.jpg",
        "https://blob.vercel.com/apparel/ls/b.jpg",
      ],
    }));
    const listing = await prisma.apparelListing.findFirst({
      where: { sellerId: seller.id },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    });
    expect(listing!.images).toHaveLength(2);
    expect(listing!.images[0].originalUrl).toBe("https://blob.vercel.com/apparel/ls/a.jpg");
    expect(listing!.images[0].isPrimary).toBe(true);
    expect(listing!.images[1].isPrimary).toBe(false);
    expect(listing!.images[1].sortOrder).toBe(1);
    // Lifestyle photos are not yet processed at create time — variants are
    // generated client-side on the edit page.
    expect(listing!.images[0].displayUrl).toBeNull();
  });

  it("succeeds with zero lifestyle photos (design file is the only required image)", async () => {
    const pt = await seedProductType();
    const { redirect } = await submit(validForm(pt, { lifestyleUrls: [] }));
    expect(redirect).toContain("/seller/apparel/");
    const listing = await prisma.apparelListing.findFirst({ where: { sellerId: seller.id } });
    expect(listing).not.toBeNull();
  });
});

// ─── getActiveProductTypesForListing — data layer ─────────────────────────────

describe("US-MFTF-5.3 — getActiveProductTypesForListing", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it("returns only active product types", async () => {
    await seedProductType({ isActive: true });
    await seedProductType({ isActive: false });
    const result = await getActiveProductTypesForListing();
    expect(result).toHaveLength(1);
  });

  it("includes colors (name + image) and sizes (label) but never provider/SKU details", async () => {
    await seedProductType();
    const [pt] = await getActiveProductTypesForListing();

    expect(pt.colors[0]).toHaveProperty("colorName");
    expect(pt.colors[0]).toHaveProperty("colorImageUrl");
    expect(pt.sizes.map((s) => s.sizeLabel)).toEqual(["S", "M", "L"]);

    // Seller-facing data must not leak dropshipper details.
    const serialized = JSON.stringify(pt);
    expect(serialized).not.toContain("providerSkuBase");
    expect(serialized).not.toContain("RNA1");
    expect(serialized).not.toContain("fulfillmentProvider");
    expect(serialized).not.toContain("providerColorCode");
  });
});
