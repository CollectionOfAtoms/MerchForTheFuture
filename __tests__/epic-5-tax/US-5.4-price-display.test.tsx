// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ApparelListingCard from "@/components/ApparelListingCard";
import type { ApparelCard } from "@/lib/apparel/browse";

const CARD: ApparelCard = {
  id: "l1",
  title: "Solar Bee Tee",
  retailPrice: 30,
  primaryImageUrl: null,
  colorCount: 2,
} as ApparelCard;

describe("US-5.4 — local-currency price display", () => {
  it("shows USD only when no display currency is provided", () => {
    render(<ApparelListingCard card={CARD} />);
    expect(screen.getByText("$30")).toBeTruthy();
  });

  it("shows the local price as primary with USD as secondary", () => {
    render(<ApparelListingCard card={CARD} display={{ currency: "EUR", rate: 0.92 }} />);
    // €27.60 → rounded display with 0 fraction digits → €28
    expect(screen.getByText(/€/)).toBeTruthy();
    expect(screen.getByText(/\(\$30\)/)).toBeTruthy();
  });

  it("shows USD only when the display currency is USD", () => {
    render(<ApparelListingCard card={CARD} display={{ currency: "USD", rate: null }} />);
    expect(screen.getByText("$30")).toBeTruthy();
    expect(screen.queryByText(/\(/)).toBeNull();
  });
});
