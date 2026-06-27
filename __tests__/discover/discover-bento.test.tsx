// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DiscoverBento from "@/components/discover/DiscoverBento";
import type { DiscoverTile } from "@/lib/discover/feed";

afterEach(cleanup);

const tiles: DiscoverTile[] = [
  { kind: "apparel", id: "a1", title: "Solar Tee", href: "/shop/a1", imageUrl: "https://x/a.jpg", price: 28, priceLabel: "$28", badge: "Apparel", description: "A soft organic cotton tee." },
  { kind: "art", id: "art1", title: "Sunrise", href: "/artwork/art1", imageUrl: "https://x/art.jpg", price: 500, priceLabel: "$500", badge: "Original", description: null },
];

describe("DiscoverBento", () => {
  it("renders a linked tile per item, mixing apparel and art", () => {
    render(<DiscoverBento tiles={tiles} />);
    expect(screen.getByRole("link", { name: /solar tee/i }).getAttribute("href")).toBe("/shop/a1");
    expect(screen.getByRole("link", { name: /sunrise/i }).getAttribute("href")).toBe("/artwork/art1");
    expect(screen.getByText("Apparel")).toBeTruthy();
    expect(screen.getByText("Original")).toBeTruthy();
    expect(screen.getByText("$28")).toBeTruthy();
  });

  it("renders the description excerpt for the hover card when present", () => {
    render(<DiscoverBento tiles={tiles} />);
    expect(screen.getByText("A soft organic cotton tee.")).toBeTruthy();
  });

  it("shows an empty state when there are no tiles", () => {
    render(<DiscoverBento tiles={[]} />);
    expect(screen.getByText(/nothing to show/i)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
