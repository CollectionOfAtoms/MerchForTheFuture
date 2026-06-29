import { describe, it, expect } from "vitest";
import { priceBand, type PriceBand, type BandThresholds } from "@/lib/pricing/band";

// US-MFTF-19.6 — the color band is a pure, presentational derivation from the
// recorded US-landed cost and two admin-configurable thresholds. It is never
// persisted. green = at/below amberAbove; amber = above amberAbove up to
// redAbove; red = above redAbove; null cost = "not recorded" (no band).

const thresholds: BandThresholds = { amberAboveCents: 1500, redAboveCents: 2500 };

describe("priceBand", () => {
  it("returns null for an unrecorded (null) cost", () => {
    expect(priceBand(null, thresholds)).toBeNull();
  });

  it("is green at or below the amber threshold", () => {
    expect(priceBand(0, thresholds)).toBe<PriceBand>("green");
    expect(priceBand(1500, thresholds)).toBe<PriceBand>("green");
  });

  it("is amber above the amber threshold up to and including the red threshold", () => {
    expect(priceBand(1501, thresholds)).toBe<PriceBand>("amber");
    expect(priceBand(2500, thresholds)).toBe<PriceBand>("amber");
  });

  it("is red above the red threshold", () => {
    expect(priceBand(2501, thresholds)).toBe<PriceBand>("red");
    expect(priceBand(9999, thresholds)).toBe<PriceBand>("red");
  });
});
