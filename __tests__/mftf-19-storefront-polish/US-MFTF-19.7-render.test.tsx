// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ApparelProductView from "@/components/ApparelProductView";
import type { ApparelDetail } from "@/lib/apparel/detail";

vi.mock("@/app/actions/cart", () => ({ addToCartAction: vi.fn(async () => ({ success: true, count: 1 })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

afterEach(cleanup);

// US-MFTF-19.7 — the per-mockup background is composited BEHIND the <img> at render
// time (CSS), on the buyer carousel/detail. The stored image URL is untouched.
const detail: ApparelDetail = {
  id: "l1",
  title: "Tee",
  description: null,
  retailPrice: 32,
  images: [
    { url: "https://images.podos.io/stone.jpg", colorName: "Stone", backgroundColor: "#000000" },
    { url: "https://images.podos.io/sand.jpg", colorName: "Sand", backgroundColor: "#ffffff" },
  ],
  colors: [
    { name: "Stone", hex: "#d6d3d1", swatchImageUrl: null },
    { name: "Sand", hex: "#e7e0c9", swatchImageUrl: null },
  ],
  sizes: ["M"],
};

function bgOf(el: HTMLElement | null): string {
  // Walk up from the <img> to find the element carrying the composited background.
  let node: HTMLElement | null = el;
  while (node) {
    if (node.style?.backgroundColor) return node.style.backgroundColor;
    node = node.parentElement;
  }
  return "";
}

describe("ApparelProductView — mockup background compositing (US-MFTF-19.7)", () => {
  it("composites the active mockup's background behind the image", () => {
    render(<ApparelProductView detail={detail} />);
    const mainImg = screen.getAllByRole("img")[0] as HTMLImageElement;
    expect(mainImg.src).toBe("https://images.podos.io/stone.jpg"); // image URL unchanged
    expect(bgOf(mainImg)).toBe("rgb(0, 0, 0)"); // #000000 composited behind
  });

  it("updates the composited background when a different colour mockup is shown", () => {
    render(<ApparelProductView detail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: /sand/i }));
    const mainImg = screen.getAllByRole("img")[0] as HTMLImageElement;
    expect(mainImg.src).toBe("https://images.podos.io/sand.jpg");
    expect(bgOf(mainImg)).toBe("rgb(255, 255, 255)");
  });
});
