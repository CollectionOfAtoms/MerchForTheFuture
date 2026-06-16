// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import ApparelProductView from "@/components/ApparelProductView";
import type { ApparelDetail } from "@/lib/apparel/detail";

afterEach(cleanup);

const detail: ApparelDetail = {
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

function renderView(overrides: Partial<ApparelDetail> = {}) {
  return render(<ApparelProductView detail={{ ...detail, ...overrides }} />);
}

describe("ApparelProductView", () => {
  it("renders title, description, and USD price", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Solar Punk Bee" })).toBeTruthy();
    expect(screen.getByText("A bee, optimistically.")).toBeTruthy();
    expect(screen.getByText("$28")).toBeTruthy();
  });

  it("renders a swatch button per offered colour", () => {
    renderView();
    expect(screen.getByRole("button", { name: /white/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /evergreen/i })).toBeTruthy();
  });

  it("shows the batch-variation note beneath the colour picker", () => {
    renderView();
    expect(screen.getByText(/exact shade may vary slightly by batch/i)).toBeTruthy();
  });

  it("highlights a colour when selected", () => {
    renderView();
    const white = screen.getByRole("button", { name: /white/i });
    expect(white.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(white);
    expect(white.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders a size button per size with none pre-selected", () => {
    renderView();
    const sizeGroup = screen.getByRole("group", { name: /size/i });
    for (const s of ["S", "M", "L"]) {
      const btn = within(sizeGroup).getByRole("button", { name: s });
      expect(btn.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("disables the add-to-cart button until both a colour and a size are chosen", () => {
    renderView();
    const addBtn = screen.getByRole("button", { name: /add to cart/i }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /white/i }));
    expect(addBtn.disabled).toBe(true); // colour only

    const sizeGroup = screen.getByRole("group", { name: /size/i });
    fireEvent.click(within(sizeGroup).getByRole("button", { name: "M" }));
    expect(addBtn.disabled).toBe(false); // colour + size
  });

  it("keeps the carousel image unchanged when a colour is selected (photos are not colour-specific)", () => {
    renderView();
    const before = (screen.getAllByRole("img")[0] as HTMLImageElement).src;
    fireEvent.click(screen.getByRole("button", { name: /evergreen/i }));
    const after = (screen.getAllByRole("img")[0] as HTMLImageElement).src;
    expect(after).toBe(before);
  });

  it("renders the carousel images", () => {
    renderView();
    const imgs = screen.getAllByRole("img") as HTMLImageElement[];
    expect(imgs.some((i) => i.src === "https://blob/a-display.jpg")).toBe(true);
  });
});
