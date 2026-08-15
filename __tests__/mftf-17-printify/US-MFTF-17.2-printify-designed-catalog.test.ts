import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { prisma, resetDatabase } from "../helpers/db";

// US-MFTF-17.2 (DESIGNED-mode criteria) — the founder-curated Printify catalog.
// A PRINTIFY ProductType pins a (blueprint_id, print_provider_id) pair; the catalog
// sync enumerates ONLY that pair's variants and caches its colours, sizes, and the
// per-(colour,size) → Printify variant-id map the fan-out orders against. Admin
// create/update accepts PRINTIFY and validates the pair. All HTTP via MSW.

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { syncDesignedProductTypeFromPrintify } = await import("@/lib/apparel/sync-printify");
const { createProductTypeAction, updateProductTypeAction } = await import(
  "@/app/actions/admin/product-catalog"
);
const { auth } = await import("@/auth");

const VARIANTS_URL =
  "https://api.printify.com/v1/catalog/blueprints/:bp/print_providers/:pp/variants.json";

/**
 * The curated (blueprint 5, provider 41) offers 2 colours × 2 sizes = 4 variants —
 * but only when `show-out-of-stock=1` is passed. WITHOUT the flag the endpoint
 * returns just the currently-in-stock subset (here: only Heather Grey). The sync
 * MUST pass the flag to cache the complete catalog, so returning the subset when it
 * doesn't makes the "caches all 4" assertions fail unless the flag is used.
 */
function stubCuratedVariants() {
  const full = [
    { id: 17391, title: "Heather Grey / S", options: { color: "Heather Grey", size: "S" } },
    { id: 17392, title: "Heather Grey / M", options: { color: "Heather Grey", size: "M" } },
    { id: 17401, title: "Black / S", options: { color: "Black", size: "S" } },
    { id: 17402, title: "Black / M", options: { color: "Black", size: "M" } },
  ];
  server.use(
    http.get(VARIANTS_URL, ({ params, request }) => {
      // Only the curated pair returns variants; anything else is an empty catalog.
      if (params.bp !== "5" || params.pp !== "41") return HttpResponse.json({ variants: [] });
      const showOOS = new URL(request.url).searchParams.get("show-out-of-stock") === "1";
      return HttpResponse.json({
        variants: showOOS ? full : full.filter((v) => v.options.color === "Heather Grey"),
      });
    }),
  );
}

function makeForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", overrides.name ?? "Printify Tee");
  fd.set("description", overrides.description ?? "");
  fd.set("fulfillmentProvider", overrides.fulfillmentProvider ?? "PRINTIFY");
  fd.set("printifyBlueprintId", overrides.printifyBlueprintId ?? "5");
  fd.set("printifyPrintProviderId", overrides.printifyPrintProviderId ?? "41");
  if (overrides.providerSkuBase !== undefined) fd.set("providerSkuBase", overrides.providerSkuBase);
  if (overrides.isActive !== undefined) fd.set("isActive", overrides.isActive);
  return fd;
}

describe("US-MFTF-17.2 — Printify catalog sync (DESIGNED)", () => {
  beforeEach(async () => {
    await resetDatabase();
    stubCuratedVariants();
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("caches colours, sizes and the (colour,size)→variantId map for the curated pair", async () => {
    const pt = await prisma.productType.create({
      data: {
        name: "Printify Tee",
        fulfillmentProvider: "PRINTIFY",
        printifyBlueprintId: 5,
        printifyPrintProviderId: 41,
      },
    });

    const result = await syncDesignedProductTypeFromPrintify(pt.id);
    expect(result.ok).toBe(true);

    const colors = await prisma.productTypeColor.findMany({ where: { productTypeId: pt.id } });
    const sizes = await prisma.productTypeSizeOption.findMany({ where: { productTypeId: pt.id } });
    const variants = await prisma.productTypePrintifyVariant.findMany({ where: { productTypeId: pt.id } });

    expect(colors.map((c) => c.colorName).sort()).toEqual(["Black", "Heather Grey"]);
    expect(sizes.map((s) => s.sizeLabel).sort()).toEqual(["M", "S"]);
    expect(variants).toHaveLength(4);

    // The combo the fan-out resolves against: colourName + canonical sizeLabel → variant id.
    const hgS = variants.find((v) => v.colorName === "Heather Grey" && v.sizeLabel === "S");
    expect(hgS?.printifyVariantId).toBe(17391);
    const blackM = variants.find((v) => v.colorName === "Black" && v.sizeLabel === "M");
    expect(blackM?.printifyVariantId).toBe(17402);
  });

  it("scopes the catalog to the curated pair — a different pair syncs nothing", async () => {
    const pt = await prisma.productType.create({
      data: {
        name: "Uncurated Tee",
        fulfillmentProvider: "PRINTIFY",
        printifyBlueprintId: 999,
        printifyPrintProviderId: 999,
      },
    });
    const result = await syncDesignedProductTypeFromPrintify(pt.id);
    expect(result.ok).toBe(false);
    expect(await prisma.productTypePrintifyVariant.count({ where: { productTypeId: pt.id } })).toBe(0);
  });

  it("re-sync is idempotent — colours/variants are not duplicated on a second run", async () => {
    const pt = await prisma.productType.create({
      data: {
        name: "Printify Tee",
        fulfillmentProvider: "PRINTIFY",
        printifyBlueprintId: 5,
        printifyPrintProviderId: 41,
      },
    });
    await syncDesignedProductTypeFromPrintify(pt.id);
    await syncDesignedProductTypeFromPrintify(pt.id);
    expect(await prisma.productTypeColor.count({ where: { productTypeId: pt.id } })).toBe(2);
    expect(await prisma.productTypePrintifyVariant.count({ where: { productTypeId: pt.id } })).toBe(4);
  });
});

describe("US-MFTF-17.2 — admin catalog actions accept PRINTIFY", () => {
  beforeEach(async () => {
    await resetDatabase();
    stubCuratedVariants();
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-1", roles: ["ADMIN"] } } as never);
  });
  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("creates a PRINTIFY product type from a valid blueprint/provider pair and auto-syncs", async () => {
    const result = await createProductTypeAction(makeForm());
    expect(result).toMatchObject({ id: expect.any(String) });
    const pt = await prisma.productType.findFirst({ where: { name: "Printify Tee" } });
    expect(pt?.fulfillmentProvider).toBe("PRINTIFY");
    expect(pt?.printifyBlueprintId).toBe(5);
    expect(pt?.printifyPrintProviderId).toBe(41);
    // Auto-sync on create seeds the combo map.
    expect(await prisma.productTypePrintifyVariant.count({ where: { productTypeId: pt!.id } })).toBe(4);
  });

  it("rejects a PRINTIFY pair Printify does not recognise and creates no row", async () => {
    const result = await createProductTypeAction(
      makeForm({ printifyBlueprintId: "999", printifyPrintProviderId: "999" }),
    );
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(await prisma.productType.count({ where: { name: "Printify Tee" } })).toBe(0);
  });

  it("still creates a PRODIGI product type (existing designed path unchanged)", async () => {
    const fd = new FormData();
    fd.set("name", "Prodigi Tee");
    fd.set("fulfillmentProvider", "PRODIGI");
    fd.set("providerSkuBase", "GLOBAL-TEE-REAL");
    const result = await createProductTypeAction(fd);
    expect(result).toMatchObject({ id: expect.any(String) });
    const pt = await prisma.productType.findFirst({ where: { name: "Prodigi Tee" } });
    expect(pt?.fulfillmentProvider).toBe("PRODIGI");
    expect(pt?.providerSkuBase).toBe("GLOBAL-TEE-REAL");
  });
});
