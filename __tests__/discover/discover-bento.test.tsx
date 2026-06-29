// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DiscoverBento from "@/components/discover/DiscoverBento";
import type { DiscoverTile } from "@/lib/discover/feed";

afterEach(cleanup);

const tiles: DiscoverTile[] = [
  {
    kind: "apparel",
    id: "a1",
    title: "Solar Tee",
    href: "/shop/a1",
    images: [
      { url: "https://x/a-life.jpg", backgroundColor: null },
      { url: "https://x/a-mock.jpg", backgroundColor: "#000000" },
    ],
    price: 28,
    priceLabel: "$28",
    badge: "Apparel",
    description: "A soft organic cotton tee.",
  },
  {
    kind: "art",
    id: "art1",
    title: "Sunrise",
    href: "/artwork/art1",
    images: [{ url: "https://x/art.jpg", backgroundColor: null }],
    price: 500,
    priceLabel: "$500",
    badge: "Original",
    description: null,
  },
];

describe("DiscoverBento", () => {
  it("links each tile to its listing, mixing apparel and art", () => {
    render(<DiscoverBento tiles={tiles} />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/shop/a1");
    expect(hrefs).toContain("/artwork/art1");
  });

  it("shows the badge and the description in the popout", () => {
    render(<DiscoverBento tiles={tiles} />);
    expect(screen.getByText("Apparel")).toBeTruthy();
    expect(screen.getByText("A soft organic cotton tee.")).toBeTruthy();
  });

  it("navigates the popout image carousel when a listing has multiple images", () => {
    render(<DiscoverBento tiles={tiles} />);
    expect(screen.getByText("1 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /next image/i }));
    expect(screen.getByText("2 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /previous image/i }));
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  it("shows no carousel controls for a single-image listing", () => {
    render(<DiscoverBento tiles={[tiles[1]]} />);
    expect(screen.queryByRole("button", { name: /next image/i })).toBeNull();
  });

  it("shows an empty state when there are no tiles", () => {
    render(<DiscoverBento tiles={[]} />);
    expect(screen.getByText(/nothing to show/i)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
