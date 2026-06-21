// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import ApparelProductView from "@/components/ApparelProductView";
import type { ApparelDetail } from "@/lib/apparel/detail";

// US-MFTF-16.2 — the first offered colour is pre-selected on load (both sourcing
// modes); size stays un-pre-selected; the buy button gates on SIZE only.

vi.mock("@/app/actions/cart", () => ({ addToCartAction: vi.fn(async () => ({ success: true, count: 1 })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

afterEach(cleanup);

// Lifestyle-photo listing (designed-style): images carry no colorName.
const lifestyle: ApparelDetail = {
  id: "listing-1",
  title: "Solar Punk Bee",
  description: "A bee, optimistically.",
  retailPrice: 28,
  images: [
    { url: "https://blob/a-display.jpg", colorName: null },
    { url: "https://blob/b-display.jpg", colorName: null },
  ],
  colors: [
    { name: "White", hex: null, swatchImageUrl: "https://blob/swatch-White.png" },
    { name: "Evergreen", hex: "#1f3d2a", swatchImageUrl: null },
  ],
  sizes: ["S", "M", "L"],
};

// Referenced-style listing: one mockup per colour, tagged by colorName.
const referenced: ApparelDetail = {
  id: "listing-2",
  title: "Powered By Plants",
  description: null,
  retailPrice: 32,
  images: [
    { url: "https://blob/mockup-Evergreen.jpg", colorName: "Evergreen" },
    { url: "https://blob/mockup-Stone.jpg", colorName: "Stone" },
  ],
  colors: [
    { name: "Evergreen", hex: "#1f3d2a", swatchImageUrl: null },
    { name: "Stone", hex: "#d6d3d1", swatchImageUrl: null },
  ],
  sizes: ["S", "M"],
};

describe("US-MFTF-16.2 — default first colour", () => {
  it("pre-selects the first colour on mount (lifestyle listing)", () => {
    render(<ApparelProductView detail={lifestyle} />);
    expect(screen.getByRole("button", { name: /white/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /evergreen/i }).getAttribute("aria-pressed")).toBe("false");
  });

  it("pre-selects the first colour on mount (referenced listing)", () => {
    render(<ApparelProductView detail={referenced} />);
    expect(screen.getByRole("button", { name: /evergreen/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /stone/i }).getAttribute("aria-pressed")).toBe("false");
  });

  it("leaves size un-pre-selected on mount", () => {
    render(<ApparelProductView detail={lifestyle} />);
    const sizeGroup = screen.getByRole("group", { name: /size/i });
    for (const s of ["S", "M", "L"]) {
      expect(within(sizeGroup).getByRole("button", { name: s }).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("enables the buy button after selecting a size only (colour already defaulted)", () => {
    render(<ApparelProductView detail={lifestyle} />);
    const addBtn = screen.getByRole("button", { name: /add to cart/i }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true); // no size yet
    const sizeGroup = screen.getByRole("group", { name: /size/i });
    fireEvent.click(within(sizeGroup).getByRole("button", { name: "M" }));
    expect(addBtn.disabled).toBe(false); // size is the only remaining gate
  });

  it("defaults the carousel to the first colour's mockup on load (referenced)", () => {
    render(<ApparelProductView detail={referenced} />);
    expect((screen.getAllByRole("img")[0] as HTMLImageElement).src).toBe("https://blob/mockup-Evergreen.jpg");
  });

  it("degrades gracefully with zero offered colours (no crash, buy disabled)", () => {
    render(<ApparelProductView detail={{ ...lifestyle, colors: [] }} />);
    const addBtn = screen.getByRole("button", { name: /add to cart/i }) as HTMLButtonElement;
    // Even after picking a size, buy stays disabled because no colour can be chosen.
    const sizeGroup = screen.getByRole("group", { name: /size/i });
    fireEvent.click(within(sizeGroup).getByRole("button", { name: "M" }));
    expect(addBtn.disabled).toBe(true);
  });
});
