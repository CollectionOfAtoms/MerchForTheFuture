// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import ApparelProductView from "@/components/ApparelProductView";
import type { ApparelDetail } from "@/lib/apparel/detail";

// US-MFTF-17.4 — the product view greys out out-of-stock colour/size combos from
// `detail.unavailable`: an unavailable size is disabled for the selected colour, a
// colour whose every size is unavailable is disabled outright, and a fully-OOS
// first colour is not pre-selected as the default.

vi.mock("@/app/actions/cart", () => ({ addToCartAction: vi.fn(async () => ({ success: true, count: 1 })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

afterEach(cleanup);

// Heather Grey: both sizes in stock. Black: M is out of stock. Sand: fully OOS.
const detail: ApparelDetail = {
  id: "listing-1",
  title: "Solar Bloom Tee",
  description: null,
  retailPrice: 30,
  images: [{ url: "https://blob/a.jpg", colorName: null }],
  colors: [
    { name: "Heather Grey", hex: "#b0b0b0", swatchImageUrl: null },
    { name: "Black", hex: "#111111", swatchImageUrl: null },
    { name: "Sand", hex: "#d8c8a8", swatchImageUrl: null },
  ],
  sizes: ["S", "M"],
  unavailable: [
    { color: "Black", size: "M" },
    { color: "Sand", size: "S" },
    { color: "Sand", size: "M" },
  ],
};

function sizeGroup() {
  return screen.getByRole("group", { name: /size/i });
}

describe("US-MFTF-17.4 — product view greys out unavailable variants", () => {
  it("disables a colour whose every size is out of stock", () => {
    render(<ApparelProductView detail={detail} />);
    expect((screen.getByRole("button", { name: /sand/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /heather grey/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables only the out-of-stock size for the selected colour", () => {
    render(<ApparelProductView detail={detail} />);
    // Default colour (Heather Grey) is fully in stock: both sizes enabled.
    expect((within(sizeGroup()).getByRole("button", { name: "S" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(sizeGroup()).getByRole("button", { name: "M" }) as HTMLButtonElement).disabled).toBe(false);
    // Switch to Black: S in stock, M out of stock.
    fireEvent.click(screen.getByRole("button", { name: /^black$/i }));
    expect((within(sizeGroup()).getByRole("button", { name: "S" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(sizeGroup()).getByRole("button", { name: "M" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps an available combo purchasable (add-to-cart enables)", () => {
    render(<ApparelProductView detail={detail} />);
    const addBtn = screen.getByRole("button", { name: /add to cart/i }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    fireEvent.click(within(sizeGroup()).getByRole("button", { name: "M" })); // Heather Grey / M — available
    expect(addBtn.disabled).toBe(false);
  });

  it("does not pre-select a fully-out-of-stock first colour", () => {
    const blackFirst: ApparelDetail = {
      ...detail,
      colors: [
        { name: "Black", hex: "#111111", swatchImageUrl: null },
        { name: "Heather Grey", hex: "#b0b0b0", swatchImageUrl: null },
      ],
      unavailable: [
        { color: "Black", size: "S" },
        { color: "Black", size: "M" },
      ],
    };
    render(<ApparelProductView detail={blackFirst} />);
    // Black is fully OOS → the first AVAILABLE colour (Heather Grey) is defaulted.
    expect(screen.getByRole("button", { name: /^black$/i }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /heather grey/i }).getAttribute("aria-pressed")).toBe("true");
  });
});
