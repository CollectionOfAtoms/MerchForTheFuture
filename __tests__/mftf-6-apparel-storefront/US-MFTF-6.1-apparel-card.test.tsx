// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ApparelListingCard from "@/components/ApparelListingCard";
import type { ApparelCard } from "@/lib/apparel/browse";

afterEach(cleanup);

const baseCard: ApparelCard = {
  id: "listing-123",
  title: "Solar Punk Bee",
  primaryImageUrl: "https://images.podos.io/mockup.jpg",
  retailPrice: 28,
  colorCount: 3,
};

describe("ApparelListingCard", () => {
  it("renders the title, USD price, and primary photo", () => {
    render(<ApparelListingCard card={baseCard} />);
    expect(screen.getByText("Solar Punk Bee")).toBeTruthy();
    expect(screen.getByText("$28")).toBeTruthy();
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe("https://images.podos.io/mockup.jpg");
  });

  it("renders the available colour count", () => {
    render(<ApparelListingCard card={baseCard} />);
    expect(screen.getByText(/available in 3 colors/i)).toBeTruthy();
  });

  it("uses the singular form for a single colour", () => {
    render(<ApparelListingCard card={{ ...baseCard, colorCount: 1 }} />);
    expect(screen.getByText(/available in 1 color\b/i)).toBeTruthy();
  });

  it("links to the apparel detail page", () => {
    render(<ApparelListingCard card={baseCard} />);
    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/shop/listing-123");
  });

  it("shows a placeholder when there is no image", () => {
    render(<ApparelListingCard card={{ ...baseCard, primaryImageUrl: null }} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/no image/i)).toBeTruthy();
  });
});
