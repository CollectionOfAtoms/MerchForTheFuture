// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ApparelProductView from "@/components/ApparelProductView";
import type { ApparelDetail } from "@/lib/apparel/detail";

vi.mock("@/app/actions/cart", () => ({ addToCartAction: vi.fn(async () => ({ success: true, count: 1 })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

afterEach(cleanup);

// US-MFTF-19.1 — union carousel: lifestyle photos lead, mockups follow. The first
// active slide is the first lifestyle photo when one exists, even though the first
// colour is pre-selected (US-MFTF-16.2). Selecting a colour still jumps to that
// colour's mockup.
const unionDetail: ApparelDetail = {
  id: "listing-3",
  title: "Powered By Plants",
  description: null,
  retailPrice: 32,
  images: [
    { url: "https://blob/life-display.jpg", colorName: null },
    { url: "https://blob/mockup-Evergreen.jpg", colorName: "Evergreen" },
    { url: "https://blob/mockup-Stone.jpg", colorName: "Stone" },
  ],
  colors: [
    { name: "Evergreen", hex: "#1f3d2a", swatchImageUrl: null },
    { name: "Stone", hex: "#d6d3d1", swatchImageUrl: null },
  ],
  sizes: ["S", "M"],
};

describe("ApparelProductView — lifestyle-then-mockups union (US-MFTF-19.1)", () => {
  it("opens on the first lifestyle photo even with the first colour pre-selected", () => {
    render(<ApparelProductView detail={unionDetail} />);
    expect((screen.getAllByRole("img")[0] as HTMLImageElement).src).toBe("https://blob/life-display.jpg");
    // First colour is still defaulted (US-MFTF-16.2).
    expect(screen.getByRole("button", { name: /evergreen/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("renders thumbnails for the full ordered media sequence", () => {
    render(<ApparelProductView detail={unionDetail} />);
    const srcs = (screen.getAllByRole("img") as HTMLImageElement[]).map((i) => i.src);
    for (const url of [
      "https://blob/life-display.jpg",
      "https://blob/mockup-Evergreen.jpg",
      "https://blob/mockup-Stone.jpg",
    ]) {
      expect(srcs).toContain(url);
    }
  });

  it("still jumps the carousel to a colour's mockup when that colour is selected", () => {
    render(<ApparelProductView detail={unionDetail} />);
    fireEvent.click(screen.getByRole("button", { name: /stone/i }));
    expect((screen.getAllByRole("img")[0] as HTMLImageElement).src).toBe("https://blob/mockup-Stone.jpg");
  });

  it("cycles the carousel with the Left/Right arrow keys", () => {
    render(<ApparelProductView detail={unionDetail} />);
    const main = () => (screen.getAllByRole("img")[0] as HTMLImageElement).src;
    expect(main()).toBe("https://blob/life-display.jpg");

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(main()).toBe("https://blob/mockup-Evergreen.jpg");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(main()).toBe("https://blob/mockup-Stone.jpg");
    // Wraps around past the end.
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(main()).toBe("https://blob/life-display.jpg");
    // And backwards, wrapping below zero.
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(main()).toBe("https://blob/mockup-Stone.jpg");
  });

  it("ignores arrow keys while typing in a form field", () => {
    render(<ApparelProductView detail={unionDetail} />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect((screen.getAllByRole("img")[0] as HTMLImageElement).src).toBe("https://blob/life-display.jpg");
    input.remove();
  });
});
