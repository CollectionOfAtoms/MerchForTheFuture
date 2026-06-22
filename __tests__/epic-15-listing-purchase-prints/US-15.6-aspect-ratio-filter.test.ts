import { describe, it, expect } from "vitest";
import { parseArtworkDimensions, filterByAspectRatio, filterByAspectRatioStrict } from "@/lib/print/listing";
import type { CatalogProduct } from "@/lib/print/listing";

// A small, representative sub-catalog for testing
const testCatalog: CatalogProduct[] = [
  // 4:5 ratio (portrait)
  { sku: "GLOBAL-FAP-8X10",  description: "8×10 paper",  productDimensions: { width: 8,  height: 10, units: "in" } },
  { sku: "GLOBAL-FAP-16X20", description: "16×20 paper", productDimensions: { width: 16, height: 20, units: "in" } },
  { sku: "GLOBAL-CAN-16X20", description: "16×20 canvas",productDimensions: { width: 16, height: 20, units: "in" } },
  // 2:3 ratio
  { sku: "GLOBAL-FAP-8X12",  description: "8×12 paper",  productDimensions: { width: 8,  height: 12, units: "in" } },
  { sku: "GLOBAL-FAP-16X24", description: "16×24 paper", productDimensions: { width: 16, height: 24, units: "in" } },
  // square 1:1
  { sku: "GLOBAL-FAP-8X8",   description: "8×8 paper",   productDimensions: { width: 8,  height: 8,  units: "in" } },
  { sku: "GLOBAL-CAN-8X8",   description: "8×8 canvas",  productDimensions: { width: 8,  height: 8,  units: "in" } },
];

describe("US-15.6 — Print Catalog Filtered by Aspect Ratio", () => {
  describe("parseArtworkDimensions", () => {
    it("parses '16×20 in' into { widthIn: 16, heightIn: 20 }", () => {
      const result = parseArtworkDimensions("16×20 in");
      expect(result).toEqual({ widthIn: 16, heightIn: 20 });
    });

    it('parses \'24" × 36"\' into { widthIn: 24, heightIn: 36 }', () => {
      const result = parseArtworkDimensions('24" × 36"');
      expect(result).toEqual({ widthIn: 24, heightIn: 36 });
    });

    it("parses '60×90 cm' into approximately { widthIn: 23.6, heightIn: 35.4 }", () => {
      const result = parseArtworkDimensions("60×90 cm");
      expect(result).not.toBeNull();
      expect(result!.widthIn).toBeCloseTo(60 / 2.54, 1);
      expect(result!.heightIn).toBeCloseTo(90 / 2.54, 1);
    });

    it("returns null for null input", () => {
      expect(parseArtworkDimensions(null)).toBeNull();
    });

    it("returns null for non-parseable string like 'large'", () => {
      expect(parseArtworkDimensions("large")).toBeNull();
    });
  });

  describe("filterByAspectRatio", () => {
    it("returns full catalog unchanged when dims is null", () => {
      const result = filterByAspectRatio(testCatalog, null);
      expect(result).toEqual(testCatalog);
    });

    it("returns only 4:5 ratio SKUs when dims match 4:5 (e.g. 16×20)", () => {
      const result = filterByAspectRatio(testCatalog, { widthIn: 16, heightIn: 20 });
      const skus = result.map((p) => p.sku);
      // 4:5 products should be included
      expect(skus).toContain("GLOBAL-FAP-8X10");
      expect(skus).toContain("GLOBAL-FAP-16X20");
      expect(skus).toContain("GLOBAL-CAN-16X20");
      // 2:3 and 1:1 products should not appear (well outside 10%)
      expect(skus).not.toContain("GLOBAL-FAP-8X12");
      expect(skus).not.toContain("GLOBAL-FAP-8X8");
    });

    it("falls back to full catalog when no catalog sizes match the artwork ratio", () => {
      // Use a very unusual ratio (3:7) that matches nothing in testCatalog
      const result = filterByAspectRatio(testCatalog, { widthIn: 3, heightIn: 7 });
      expect(result.length).toBe(testCatalog.length);
    });

    it("always includes a previously-saved SKU even if outside the ratio threshold", () => {
      // Artwork is 4:5, but seller has previously saved a square 8×8 canvas
      const savedSkus = new Set(["GLOBAL-CAN-8X8"]);
      const result = filterByAspectRatio(testCatalog, { widthIn: 16, heightIn: 20 }, savedSkus);
      const skus = result.map((p) => p.sku);
      expect(skus).toContain("GLOBAL-CAN-8X8");
      // Saved item appears after the matched items (appended at end)
      const savedIndex = skus.indexOf("GLOBAL-CAN-8X8");
      const matchedIndices = ["GLOBAL-FAP-8X10", "GLOBAL-FAP-16X20", "GLOBAL-CAN-16X20"].map((s) =>
        skus.indexOf(s)
      );
      expect(Math.max(...matchedIndices)).toBeLessThan(savedIndex);
    });

    it("sorts results by closest ratio match first", () => {
      // 4:5 = 1.25. Among 4:5 items, all have the same exact ratio, so just confirm the list is sorted
      // Use a dims slightly off from 4:5 to observe ordering
      // 12×20 → ratio 20/12 = 1.667
      // 8×10 → ratio 1.25 (diff 0.417), 8×12 → 1.5 (diff 0.167), 8×8 → 1.0 (diff 0.667)
      // With dims 12×20 (ratio=1.667):
      //   - 8×12 (1.5): diff=0.167
      //   - 8×10 (1.25): diff=0.417
      //   - 16×20 (1.25): diff=0.417
      //   - 16×24 (1.5): diff=0.167
      //   ... but 8×8 (1.0) may be outside tolerance
      const result = filterByAspectRatio(testCatalog, { widthIn: 12, heightIn: 20 });
      // Just verify the list is not empty and is sorted ascending by ratio difference
      for (let i = 1; i < result.length; i++) {
        const artRatio = 20 / 12;
        const prev = result[i - 1];
        const curr = result[i];
        const prevRatio = Math.max(prev.productDimensions.width, prev.productDimensions.height) /
          Math.min(prev.productDimensions.width, prev.productDimensions.height);
        const currRatio = Math.max(curr.productDimensions.width, curr.productDimensions.height) /
          Math.min(curr.productDimensions.width, curr.productDimensions.height);
        expect(Math.abs(prevRatio - artRatio)).toBeLessThanOrEqual(Math.abs(currRatio - artRatio));
      }
    });
  });

  describe("filterByAspectRatioStrict (seller picker default — MFTF-PF enhancement)", () => {
    it("returns the full catalog when dims is null (nothing to filter on)", () => {
      expect(filterByAspectRatioStrict(testCatalog, null)).toEqual(testCatalog);
    });

    it("returns only within-10% matches for a 4:5 piece", () => {
      const skus = filterByAspectRatioStrict(testCatalog, { widthIn: 16, heightIn: 20 }).map((p) => p.sku);
      expect(skus).toContain("GLOBAL-FAP-8X10");
      expect(skus).toContain("GLOBAL-CAN-16X20");
      expect(skus).not.toContain("GLOBAL-FAP-8X12");
      expect(skus).not.toContain("GLOBAL-FAP-8X8");
    });

    it("returns an EMPTY list (no whole-catalog fallback) when nothing matches", () => {
      // 3:7 matches nothing in testCatalog — strict yields [], unlike filterByAspectRatio.
      expect(filterByAspectRatioStrict(testCatalog, { widthIn: 3, heightIn: 7 })).toHaveLength(0);
      expect(filterByAspectRatio(testCatalog, { widthIn: 3, heightIn: 7 })).toHaveLength(testCatalog.length);
    });

    it("still includes a saved out-of-ratio SKU so prior selections stay visible", () => {
      const skus = filterByAspectRatioStrict(testCatalog, { widthIn: 16, heightIn: 20 }, new Set(["GLOBAL-CAN-8X8"])).map((p) => p.sku);
      expect(skus).toContain("GLOBAL-CAN-8X8");
    });
  });
});
