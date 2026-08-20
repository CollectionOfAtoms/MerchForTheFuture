import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { prisma, resetDatabase } from "../helpers/db";

// US-MFTF-17.7 — the Printify catalog sync captures each curated variant's FRONT
// print-area pixel dimensions (fetched in variants.json today but discarded) into a
// new ProductType.printifyPrintAreas Json? column, shape { front: { width, height } }.
// Because per-variant front dims can differ slightly by size, ONE representative
// (modal) dimension is stored per product type — ties broken by the median-ranked
// size. Best-effort: a variant with no front placeholder is excluded, not fatal.

process.env.PRINTIFY_SHOP_ID = "shop-test";
process.env.PRINTIFY_API_KEY = "test_key";

const { syncDesignedProductTypeFromPrintify, computeModalFrontPrintArea } = await import(
  "@/lib/apparel/sync-printify"
);

const VARIANTS_URL =
  "https://api.printify.com/v1/catalog/blueprints/:bp/print_providers/:pp/variants.json";

const front = (width: number, height: number) => ({
  position: "front",
  decoration_method: "dtg",
  width,
  height,
});
const back = (width: number, height: number) => ({
  position: "back",
  decoration_method: "dtg",
  width,
  height,
});

/** Override the curated-variants endpoint with an explicit fixture (all sizes returned). */
function stubVariants(variants: unknown[]) {
  server.use(http.get(VARIANTS_URL, () => HttpResponse.json({ variants })));
}

async function seedPrintifyType() {
  return prisma.productType.create({
    data: {
      name: `Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRINTIFY",
      printifyBlueprintId: 5,
      printifyPrintProviderId: 41,
      isActive: true,
    },
  });
}

async function readPrintAreas(productTypeId: string) {
  const pt = await prisma.productType.findUnique({ where: { id: productTypeId } });
  return pt!.printifyPrintAreas as { front?: { width: number; height: number } } | null;
}

describe("US-MFTF-17.7 — capture Printify front print-area dims at sync", () => {
  beforeEach(async () => resetDatabase());
  afterEach(async () => resetDatabase());

  it("stores the MODAL front {width,height} across the curated variants", async () => {
    // 2400×2800 occurs on 3 of 4 sizes → it's the mode; 2000×2500 (S) is the outlier.
    stubVariants([
      { id: 1, options: { color: "Black", size: "S" }, placeholders: [front(2000, 2500), back(2000, 2500)] },
      { id: 2, options: { color: "Black", size: "M" }, placeholders: [front(2400, 2800)] },
      { id: 3, options: { color: "Black", size: "L" }, placeholders: [front(2400, 2800)] },
      { id: 4, options: { color: "Black", size: "XL" }, placeholders: [front(2400, 2800)] },
    ]);
    const pt = await seedPrintifyType();
    const result = await syncDesignedProductTypeFromPrintify(pt.id);
    expect(result.ok).toBe(true);

    expect(await readPrintAreas(pt.id)).toEqual({ front: { width: 2400, height: 2800 } });
  });

  it("breaks a frequency tie by preferring the median-ranked size's dims", async () => {
    // Three distinct dims, one per size → a 3-way tie; the median size (M) wins.
    stubVariants([
      { id: 1, options: { color: "Black", size: "S" }, placeholders: [front(2000, 2500)] },
      { id: 2, options: { color: "Black", size: "M" }, placeholders: [front(2400, 2800)] },
      { id: 3, options: { color: "Black", size: "L" }, placeholders: [front(2600, 3000)] },
    ]);
    const pt = await seedPrintifyType();
    await syncDesignedProductTypeFromPrintify(pt.id);

    expect(await readPrintAreas(pt.id)).toEqual({ front: { width: 2400, height: 2800 } });
  });

  it("excludes a variant with no front placeholder without failing the sync", async () => {
    // Variant 3 offers only a back area (e.g. a back-only decoration) → excluded from
    // the mode; the sync still succeeds and captures colours/sizes for every variant.
    stubVariants([
      { id: 1, options: { color: "Black", size: "S" }, placeholders: [front(2400, 2800)] },
      { id: 2, options: { color: "Black", size: "M" }, placeholders: [front(2400, 2800)] },
      { id: 3, options: { color: "Black", size: "L" }, placeholders: [back(2400, 2800)] },
    ]);
    const pt = await seedPrintifyType();
    const result = await syncDesignedProductTypeFromPrintify(pt.id);

    expect(result.ok).toBe(true);
    expect((result as { ok: true; variants: number }).variants).toBe(3);
    expect(await readPrintAreas(pt.id)).toEqual({ front: { width: 2400, height: 2800 } });
  });

  it("leaves printifyPrintAreas null when NO variant has a front placeholder", async () => {
    stubVariants([
      { id: 1, options: { color: "Black", size: "S" }, placeholders: [back(2400, 2800)] },
      { id: 2, options: { color: "Black", size: "M" }, placeholders: [] },
    ]);
    const pt = await seedPrintifyType();
    const result = await syncDesignedProductTypeFromPrintify(pt.id);

    expect(result.ok).toBe(true);
    expect(await readPrintAreas(pt.id)).toBeNull();
  });

  it("updates printifyPrintAreas in place on re-sync (no duplication)", async () => {
    const pt = await seedPrintifyType();

    stubVariants([
      { id: 1, options: { color: "Black", size: "S" }, placeholders: [front(2400, 2800)] },
    ]);
    await syncDesignedProductTypeFromPrintify(pt.id);
    expect(await readPrintAreas(pt.id)).toEqual({ front: { width: 2400, height: 2800 } });

    stubVariants([
      { id: 1, options: { color: "Black", size: "S" }, placeholders: [front(3000, 3600)] },
    ]);
    await syncDesignedProductTypeFromPrintify(pt.id);
    expect(await readPrintAreas(pt.id)).toEqual({ front: { width: 3000, height: 3600 } });
  });
});

describe("computeModalFrontPrintArea (pure)", () => {
  it("returns the most frequent front pair", () => {
    expect(
      computeModalFrontPrintArea([
        { options: { size: "S" }, placeholders: [front(2000, 2500)] },
        { options: { size: "M" }, placeholders: [front(2400, 2800)] },
        { options: { size: "L" }, placeholders: [front(2400, 2800)] },
      ]),
    ).toEqual({ width: 2400, height: 2800 });
  });

  it("breaks a tie among the tied pairs using the median-ranked size", () => {
    expect(
      computeModalFrontPrintArea([
        { options: { size: "S" }, placeholders: [front(2000, 2500)] },
        { options: { size: "M" }, placeholders: [front(2400, 2800)] },
        { options: { size: "L" }, placeholders: [front(2600, 3000)] },
      ]),
    ).toEqual({ width: 2400, height: 2800 });
  });

  it("returns null when no variant carries a front placeholder", () => {
    expect(
      computeModalFrontPrintArea([
        { options: { size: "S" }, placeholders: [back(2400, 2800)] },
        { options: { size: "M" }, placeholders: [] },
        { options: { size: "L" } },
      ]),
    ).toBeNull();
  });
});
