import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import {
  aspectRatioKey,
  isCanvasSku,
  aspectForProduct,
  offeredAspects,
  offeredSizes,
  getFramingForArtwork,
  upsertFraming,
  getMockupsForArtwork,
  upsertSizeMockup,
  getPrintReadiness,
  backfillPrintFramingArchive,
} from "@/lib/print/framing";

/**
 * A canvas (4:5) + paper (4:5) + paper (2:3) offering. Distinct aspects: "4:5"
 * (canvas, since a canvas SKU offers it) and "2:3" (paper only). Four sizes.
 */
const MIXED_PRODUCTS = [
  { sku: "GLOBAL-CAN-8X10", size: "8×10 in", price: 90 },
  { sku: "GLOBAL-CAN-16X20", size: "16×20 in", price: 160 },
  { sku: "GLOBAL-FAP-8X10", size: "8×10 in", price: 40 },
  { sku: "GLOBAL-FAP-12X18", size: "12×18 in", price: 60 },
];

async function makeListing(opts: {
  status?: string;
  availableForPrint?: boolean;
  printProducts?: unknown;
} = {}) {
  const seller = await prisma.user.create({
    data: { email: `s-${Math.random()}@t.com`, name: "S", passwordHash: "x", roles: ["SELLER"] },
  });
  const artwork = await prisma.artwork.create({
    data: {
      title: "Art",
      description: "d",
      sellerId: seller.id,
      status: "PUBLISHED",
      images: { create: [{ url: "https://example.com/p.jpg", isPrimary: true, order: 0 }] },
    },
  });
  const listing = await prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: "FIXED_PRICE",
      price: 500,
      currency: "USD",
      status: (opts.status ?? "ACTIVE") as never,
      availableForPrint: opts.availableForPrint ?? false,
      printSourceImageUrl: "https://cdn.example.com/hires.jpg",
      printProducts: (opts.printProducts ?? null) as never,
    },
  });
  return { sellerId: seller.id, artworkId: artwork.id, listingId: listing.id };
}

describe("US-MFTF-PF.1 — Print Framing & Mockup Schema + Backfill", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });

  describe("pure helpers", () => {
    it("aspectRatioKey reduces dimensions to lowest terms", () => {
      expect(aspectRatioKey(8, 10)).toBe("4:5");
      expect(aspectRatioKey(16, 20)).toBe("4:5");
      expect(aspectRatioKey(12, 18)).toBe("2:3");
      expect(aspectRatioKey(20, 20)).toBe("1:1");
    });

    it("isCanvasSku distinguishes canvas from paper SKUs", () => {
      expect(isCanvasSku("GLOBAL-CAN-8X10")).toBe(true);
      expect(isCanvasSku("GLOBAL-FAP-8X10")).toBe(false);
    });

    it("aspectForProduct derives the aspect from the size label", () => {
      expect(aspectForProduct({ sku: "GLOBAL-CAN-8X10", size: "8×10 in" })).toBe("4:5");
      expect(aspectForProduct({ sku: "GLOBAL-FAP-12X18", size: "12×18 in" })).toBe("2:3");
    });

    it("aspectForProduct falls back to the catalog when no size label", () => {
      expect(aspectForProduct({ sku: "GLOBAL-CAN-16X20" })).toBe("4:5");
    });

    it("offeredAspects returns distinct aspects, marking canvas when any canvas SKU offers it", () => {
      const aspects = offeredAspects(MIXED_PRODUCTS);
      const map = new Map(aspects.map((a) => [a.aspectRatio, a.isCanvas]));
      expect(map.get("4:5")).toBe(true); // canvas SKU offers 4:5
      expect(map.get("2:3")).toBe(false); // paper only
      expect(aspects.length).toBe(2);
    });

    it("offeredSizes returns each distinct SKU", () => {
      expect(offeredSizes(MIXED_PRODUCTS).sort()).toEqual(
        ["GLOBAL-CAN-16X20", "GLOBAL-CAN-8X10", "GLOBAL-FAP-12X18", "GLOBAL-FAP-8X10"],
      );
    });
  });

  describe("PrintFraming model round-trip", () => {
    it("stores a canvas framing row with a non-null wrap and crop rect", async () => {
      const { artworkId } = await makeListing();
      const row = await upsertFraming(artworkId, "4:5", {
        wrap: "MIRROR_WRAP",
        croppedUrl: "https://blob/crop-4x5.jpg",
        cropX: 0.1,
        cropY: 0.0,
        cropW: 0.8,
        cropH: 1.0,
      });
      expect(row.wrap).toBe("MIRROR_WRAP");
      expect(row.croppedUrl).toBe("https://blob/crop-4x5.jpg");
      expect(row.needsReframe).toBe(false);

      const fetched = await getFramingForArtwork(artworkId);
      expect(fetched).toHaveLength(1);
      expect(fetched[0].cropW).toBeCloseTo(0.8);
    });

    it("stores a paper framing row with a null wrap", async () => {
      const { artworkId } = await makeListing();
      const row = await upsertFraming(artworkId, "2:3", {
        croppedUrl: "https://blob/crop-2x3.jpg",
      });
      expect(row.wrap).toBeNull();
      expect(row.croppedUrl).toBe("https://blob/crop-2x3.jpg");
    });

    it("upsertFraming updates an existing row for the same [artworkId, aspectRatio]", async () => {
      const { artworkId } = await makeListing();
      await upsertFraming(artworkId, "4:5", { wrap: "WHITE" });
      const updated = await upsertFraming(artworkId, "4:5", {
        croppedUrl: "https://blob/c.jpg",
        needsReframe: false,
      });
      expect(updated.wrap).toBe("WHITE"); // preserved
      expect(updated.croppedUrl).toBe("https://blob/c.jpg");
      expect(await getFramingForArtwork(artworkId)).toHaveLength(1);
    });

    it("enforces uniqueness on [artworkId, aspectRatio] at the DB level", async () => {
      const { artworkId } = await makeListing();
      await prisma.printFraming.create({ data: { artworkId, aspectRatio: "4:5" } });
      await expect(
        prisma.printFraming.create({ data: { artworkId, aspectRatio: "4:5" } }),
      ).rejects.toThrow();
    });
  });

  describe("PrintSizeMockup model round-trip", () => {
    it("stores and fetches per-size mockups", async () => {
      const { artworkId } = await makeListing();
      await upsertSizeMockup(artworkId, "GLOBAL-CAN-8X10", "https://blob/m1.jpg");
      await upsertSizeMockup(artworkId, "GLOBAL-FAP-8X10", "https://blob/m2.jpg");
      const mockups = await getMockupsForArtwork(artworkId);
      expect(mockups).toHaveLength(2);
    });

    it("upsertSizeMockup overwrites the prior URL for the same size", async () => {
      const { artworkId } = await makeListing();
      await upsertSizeMockup(artworkId, "GLOBAL-CAN-8X10", "https://blob/old.jpg");
      const updated = await upsertSizeMockup(artworkId, "GLOBAL-CAN-8X10", "https://blob/new.jpg");
      expect(updated.mockupUrl).toBe("https://blob/new.jpg");
      expect(await getMockupsForArtwork(artworkId)).toHaveLength(1);
    });

    it("enforces uniqueness on [artworkId, sizeSku] at the DB level", async () => {
      const { artworkId } = await makeListing();
      await prisma.printSizeMockup.create({
        data: { artworkId, sizeSku: "GLOBAL-CAN-8X10", mockupUrl: "https://blob/a.jpg" },
      });
      await expect(
        prisma.printSizeMockup.create({
          data: { artworkId, sizeSku: "GLOBAL-CAN-8X10", mockupUrl: "https://blob/b.jpg" },
        }),
      ).rejects.toThrow();
    });
  });

  describe("getPrintReadiness", () => {
    it("reports all aspects/sizes missing when nothing is framed or mocked", async () => {
      const { artworkId } = await makeListing({ availableForPrint: true, printProducts: MIXED_PRODUCTS });
      const r = await getPrintReadiness(artworkId);
      expect(r.enabled).toBe(true);
      expect(r.missingAspects.sort()).toEqual(["2:3", "4:5"]);
      expect(r.missingSizes).toHaveLength(4);
      expect(r.ready).toBe(false);
    });

    it("is ready only when every aspect is framed and every size is mocked", async () => {
      const { artworkId } = await makeListing({ availableForPrint: true, printProducts: MIXED_PRODUCTS });
      await upsertFraming(artworkId, "4:5", { croppedUrl: "https://blob/45.jpg", wrap: "MIRROR_WRAP" });
      await upsertFraming(artworkId, "2:3", { croppedUrl: "https://blob/23.jpg" });
      for (const sku of offeredSizes(MIXED_PRODUCTS)) {
        await upsertSizeMockup(artworkId, sku, `https://blob/${sku}.jpg`);
      }
      const r = await getPrintReadiness(artworkId);
      expect(r.missingAspects).toHaveLength(0);
      expect(r.missingSizes).toHaveLength(0);
      expect(r.ready).toBe(true);
    });

    it("treats a needsReframe=true aspect as missing even with a croppedUrl", async () => {
      const { artworkId } = await makeListing({ availableForPrint: true, printProducts: MIXED_PRODUCTS });
      await upsertFraming(artworkId, "4:5", { croppedUrl: "https://blob/45.jpg", needsReframe: true });
      await upsertFraming(artworkId, "2:3", { croppedUrl: "https://blob/23.jpg" });
      for (const sku of offeredSizes(MIXED_PRODUCTS)) {
        await upsertSizeMockup(artworkId, sku, `https://blob/${sku}.jpg`);
      }
      const r = await getPrintReadiness(artworkId);
      expect(r.missingAspects).toEqual(["4:5"]);
      expect(r.ready).toBe(false);
    });

    it("is ready (gate N/A) when prints are disabled", async () => {
      const { artworkId } = await makeListing({ availableForPrint: false });
      const r = await getPrintReadiness(artworkId);
      expect(r.enabled).toBe(false);
      expect(r.ready).toBe(true);
    });
  });

  describe("strict backfill", () => {
    it("archives an ACTIVE prints-enabled listing missing a crop and sets needsReframe", async () => {
      const { listingId, artworkId } = await makeListing({
        availableForPrint: true,
        printProducts: MIXED_PRODUCTS,
      });
      const { archivedListingIds } = await backfillPrintFramingArchive();
      expect(archivedListingIds).toContain(listingId);

      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.status).toBe("ARCHIVED");

      const framings = await getFramingForArtwork(artworkId);
      expect(framings.some((f) => f.needsReframe)).toBe(true);
    });

    it("archives an ACTIVE listing that is fully framed but missing a size mockup", async () => {
      const { listingId, artworkId } = await makeListing({
        availableForPrint: true,
        printProducts: MIXED_PRODUCTS,
      });
      await upsertFraming(artworkId, "4:5", { croppedUrl: "https://blob/45.jpg" });
      await upsertFraming(artworkId, "2:3", { croppedUrl: "https://blob/23.jpg" });
      // only mock three of the four sizes
      await upsertSizeMockup(artworkId, "GLOBAL-CAN-8X10", "https://blob/a.jpg");
      await upsertSizeMockup(artworkId, "GLOBAL-CAN-16X20", "https://blob/b.jpg");
      await upsertSizeMockup(artworkId, "GLOBAL-FAP-8X10", "https://blob/c.jpg");

      const { archivedListingIds } = await backfillPrintFramingArchive();
      expect(archivedListingIds).toContain(listingId);
      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.status).toBe("ARCHIVED");
    });

    it("leaves a fully framed + mocked ACTIVE listing untouched", async () => {
      const { listingId, artworkId } = await makeListing({
        availableForPrint: true,
        printProducts: MIXED_PRODUCTS,
      });
      await upsertFraming(artworkId, "4:5", { croppedUrl: "https://blob/45.jpg" });
      await upsertFraming(artworkId, "2:3", { croppedUrl: "https://blob/23.jpg" });
      for (const sku of offeredSizes(MIXED_PRODUCTS)) {
        await upsertSizeMockup(artworkId, sku, `https://blob/${sku}.jpg`);
      }
      const { archivedListingIds } = await backfillPrintFramingArchive();
      expect(archivedListingIds).not.toContain(listingId);
      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.status).toBe("ACTIVE");
    });

    it("leaves a prints-disabled ACTIVE listing untouched regardless", async () => {
      const { listingId } = await makeListing({ availableForPrint: false });
      const { archivedListingIds } = await backfillPrintFramingArchive();
      expect(archivedListingIds).not.toContain(listingId);
      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.status).toBe("ACTIVE");
    });
  });
});
