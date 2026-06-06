import { describe, it, expect } from "vitest";
import costs from "@/lib/print/costs.json";
import { getPrintCatalog } from "@/lib/print/listing";

describe("US-15.7 — Print Cost Estimates in Setup", () => {
  it("costs.json has at least 70 entries", () => {
    expect(Object.keys(costs).length).toBeGreaterThanOrEqual(70);
  });

  it("every SKU in the print catalog has a corresponding cost in costs.json", () => {
    const catalog = getPrintCatalog();
    const missingSku: string[] = [];
    for (const product of catalog) {
      if ((costs as Record<string, number>)[product.sku] == null) {
        missingSku.push(product.sku);
      }
    }
    expect(missingSku).toEqual([]);
  });

  it("all cost values are positive numbers", () => {
    for (const [sku, cost] of Object.entries(costs as Record<string, number>)) {
      expect(typeof cost).toBe("number");
      expect(cost).toBeGreaterThan(0);
      void sku; // suppress unused variable warning
    }
  });

  it("FAP 8×10 costs $9", () => {
    expect((costs as Record<string, number>)["GLOBAL-FAP-8X10"]).toBe(9);
  });

  it("canvas 40×60 cost is greater than FAP 40×60 cost (canvas is more expensive than paper)", () => {
    const canvasCost = (costs as Record<string, number>)["GLOBAL-CAN-40X60"];
    const paperCost = (costs as Record<string, number>)["GLOBAL-FAP-40X60"];
    expect(canvasCost).toBeGreaterThan(paperCost);
  });
});
