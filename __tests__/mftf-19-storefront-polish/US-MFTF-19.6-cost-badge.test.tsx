// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import UsLandedCostBadge from "@/components/pricing/UsLandedCostBadge";
import type { BandThresholds } from "@/lib/pricing/band";

afterEach(cleanup);

const thresholds: BandThresholds = { amberAboveCents: 1500, redAboveCents: 2500 };

describe("UsLandedCostBadge (US-MFTF-19.6)", () => {
  it("renders the dollar amount and a green band for a cheap cost", () => {
    render(<UsLandedCostBadge cost={1200} thresholds={thresholds} />);
    expect(screen.getByText(/\$12\.00/)).toBeTruthy();
    expect(screen.getByTestId("cost-badge").getAttribute("data-band")).toBe("green");
  });

  it("renders an amber band in the middle range", () => {
    render(<UsLandedCostBadge cost={2000} thresholds={thresholds} />);
    expect(screen.getByTestId("cost-badge").getAttribute("data-band")).toBe("amber");
  });

  it("renders a red band above the red threshold", () => {
    render(<UsLandedCostBadge cost={3000} thresholds={thresholds} />);
    expect(screen.getByTestId("cost-badge").getAttribute("data-band")).toBe("red");
  });

  it("renders a neutral 'not recorded' state for a null cost (no misleading band)", () => {
    render(<UsLandedCostBadge cost={null} thresholds={thresholds} />);
    const badge = screen.getByTestId("cost-badge");
    expect(badge.getAttribute("data-band")).toBe("none");
    expect(screen.getByText(/not recorded/i)).toBeTruthy();
  });
});
