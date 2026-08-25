import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  buildPrintifyReferencedProduct,
  PRINTIFY_PRODUCT_ID,
} from "../mocks/printify-fixture";
import { prisma, resetDatabase } from "../helpers/db";

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { resolvePrintifyRefAction, createReferencedPrintifyListingAction } = await import(
  "@/app/actions/referenced-apparel"
);
const { parsePrintifyProductId } = await import("@/lib/fulfillment/printify");
const { auth } = await import("@/auth");

const PRODUCT_URL = "https://api.printify.com/v1/shops/:shop/products/:id.json";

async function seedSeller(roles: string[] = ["SELLER"]) {
  return prisma.user.create({
    data: { email: `s-${crypto.randomUUID()}@t.com`, name: "S", roles: roles as never },
  });
}

function makeForm(fields: {
  providerProductRef?: string;
  title?: string;
  description?: string;
  retailPrice?: string;
  intent?: string;
  lifestyleUrls?: string[];
}): FormData {
  const fd = new FormData();
  if (fields.providerProductRef !== undefined) fd.set("providerProductRef", fields.providerProductRef);
  if (fields.title !== undefined) fd.set("title", fields.title);
  if (fields.description !== undefined) fd.set("description", fields.description);
  if (fields.retailPrice !== undefined) fd.set("retailPrice", fields.retailPrice);
  if (fields.intent !== undefined) fd.set("intent", fields.intent);
  for (const url of fields.lifestyleUrls ?? []) fd.append("lifestyleImageUrl", url);
  return fd;
}

function validForm(overrides: Partial<Parameters<typeof makeForm>[0]> = {}) {
  return makeForm({
    providerProductRef: PRINTIFY_PRODUCT_ID,
    title: "Protect Our Oceans",
    description: "Recycled tee",
    retailPrice: "40",
    intent: "publish",
    lifestyleUrls: [],
    ...overrides,
  });
}

async function submit(fd: FormData): Promise<{ result?: unknown; redirect?: string }> {
  try {
    return { result: await createReferencedPrintifyListingAction(undefined, fd) };
  } catch (e) {
    return { redirect: (e as Error).message };
  }
}

// ─── parsePrintifyProductId ───────────────────────────────────────────────────

describe("US-MFTF-17.13 — parsePrintifyProductId", () => {
  it("extracts the 24-hex product_id from a Printify product URL", () => {
    expect(
      parsePrintifyProductId(`https://printify.com/app/store/products/${PRINTIFY_PRODUCT_ID}`),
    ).toBe(PRINTIFY_PRODUCT_ID);
  });
  it("accepts a bare product_id", () => {
    expect(parsePrintifyProductId(PRINTIFY_PRODUCT_ID)).toBe(PRINTIFY_PRODUCT_ID);
  });
  it("returns null for empty input", () => {
    expect(parsePrintifyProductId("")).toBeNull();
    expect(parsePrintifyProductId("   ")).toBeNull();
  });
});

// ─── resolvePrintifyRefAction ─────────────────────────────────────────────────

describe("US-MFTF-17.13 — resolvePrintifyRefAction preview", () => {
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

  it("is Unauthorized for a non-seller", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "b", roles: ["BUYER"] } } as never);
    const res = await resolvePrintifyRefAction(PRINTIFY_PRODUCT_ID);
    expect(res).toEqual({ error: "Unauthorized" });
  });

  it("returns a USD preview with colour swatches, sizes and mockups", async () => {
    const res = await resolvePrintifyRefAction(
      `https://printify.com/app/store/products/${PRINTIFY_PRODUCT_ID}`,
    );
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.preview.title).toBe("Protect Our Oceans");
    expect(res.preview.providerBaseCurrency).toBe("USD");
    expect(res.preview.providerBasePrice).toBe(22);
    expect(res.preview.colors.find((c) => c.colorName === "Heather Grey")?.colorHex).toBe("#b8bcc2");
    expect(res.preview.sizes).toEqual(expect.arrayContaining(["S", "M"]));
    expect(res.preview.mockups.length).toBeGreaterThan(0);
    // Black/M is out of stock, so only 3 of 4 variants are orderable.
    expect(res.preview.orderableCount).toBe(3);
  });

  it("returns an error when the product is not found (404)", async () => {
    server.use(
      http.get(PRODUCT_URL, () => HttpResponse.json({ message: "Not found" }, { status: 404 })),
    );
    const res = await resolvePrintifyRefAction(PRINTIFY_PRODUCT_ID);
    expect("error" in res).toBe(true);
    if (!("error" in res)) return;
    expect(res.error).toMatch(/find|Printify|product/i);
  });
});

// ─── createReferencedPrintifyListingAction ────────────────────────────────────

describe("US-MFTF-17.13 — createReferencedPrintifyListingAction", () => {
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

  it("returns Unauthorized for a non-seller", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "b", roles: ["BUYER"] } } as never);
    const { result } = await submit(validForm());
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("rejects a retail price below $1", async () => {
    const { result } = await submit(validForm({ retailPrice: "0.50" }));
    expect(result).toMatchObject({ error: expect.stringMatching(/price/i) });
    expect(await prisma.apparelListing.count()).toBe(0);
  });

  it("rejects a missing title", async () => {
    const { result } = await submit(validForm({ title: "" }));
    expect(result).toMatchObject({ error: expect.stringMatching(/title/i) });
  });

  it("rejects publishing when no variant is orderable", async () => {
    server.use(
      http.get(PRODUCT_URL, () =>
        HttpResponse.json(
          buildPrintifyReferencedProduct({ unavailableVariantIds: [17391, 17392, 17401, 17402] }),
        ),
      ),
    );
    const { result } = await submit(validForm());
    expect(result).toMatchObject({ error: expect.stringMatching(/stock|orderable/i) });
    expect(await prisma.apparelListing.count()).toBe(0);
  });

  it("creates a REFERENCED printify listing with variant rows, then redirects to edit", async () => {
    const { redirect } = await submit(validForm({ intent: "publish" }));
    const listing = await prisma.apparelListing.findFirst({
      where: { sellerId: seller.id },
      include: { referencedVariants: true, colors: true },
    });
    expect(listing).not.toBeNull();
    expect(listing!.sourcingMode).toBe("REFERENCED");
    expect(listing!.status).toBe("ACTIVE");
    expect(listing!.productTypeId).toBeNull();
    expect(listing!.designImageUrl).toBeNull();
    expect(listing!.providerKey).toBe("printify");
    expect(listing!.providerProductRef).toBe(PRINTIFY_PRODUCT_ID);
    expect(listing!.providerBaseCurrency).toBe("USD");
    expect(Number(listing!.providerBasePrice)).toBe(22);
    expect(Number(listing!.retailPrice)).toBe(40);
    expect(listing!.colors).toHaveLength(0);
    expect(listing!.referencedVariants).toHaveLength(4);
    expect(redirect).toContain(`/seller/apparel/${listing!.id}/edit`);
  });

  it("stores the product_id even when a full product URL is pasted", async () => {
    await submit(validForm({ providerProductRef: `https://printify.com/app/store/products/${PRINTIFY_PRODUCT_ID}` }));
    const listing = await prisma.apparelListing.findFirst({ where: { sellerId: seller.id } });
    expect(listing!.providerProductRef).toBe(PRINTIFY_PRODUCT_ID);
  });

  it("saves as a draft (UNLISTED) when intent is draft", async () => {
    await submit(validForm({ intent: "draft" }));
    const listing = await prisma.apparelListing.findFirst({ where: { sellerId: seller.id } });
    expect(listing!.status).toBe("UNLISTED");
  });
});
