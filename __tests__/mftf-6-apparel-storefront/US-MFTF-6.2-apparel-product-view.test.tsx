// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import ApparelProductView from "@/components/ApparelProductView";
import type { ApparelDetail } from "@/lib/apparel/detail";

// ApparelProductView wires the "Add to cart" button to the cart server action
// (US-MFTF-11.2). Mock it so the component test does not pull the server-only
// action module (auth/prisma/next-headers) into jsdom.
vi.mock("@/app/actions/cart", () => ({ addToCartAction: vi.fn(async () => ({ success: true, count: 1 })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

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

  it("pre-selects the first colour and highlights another when selected (US-MFTF-16.2)", () => {
    renderView();
    // First offered colour (White) is selected by default on load.
    expect(screen.getByRole("button", { name: /white/i }).getAttribute("aria-pressed")).toBe("true");
    const evergreen = screen.getByRole("button", { name: /evergreen/i });
    expect(evergreen.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(evergreen);
    expect(evergreen.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders a size button per size with none pre-selected", () => {
    renderView();
    const sizeGroup = screen.getByRole("group", { name: /size/i });
    for (const s of ["S", "M", "L"]) {
      const btn = within(sizeGroup).getByRole("button", { name: s });
      expect(btn.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("disables the add-to-cart button until a size is chosen (colour defaulted, US-MFTF-16.2)", () => {
    renderView();
    const addBtn = screen.getByRole("button", { name: /add to cart/i }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true); // colour defaulted, but no size yet

    const sizeGroup = screen.getByRole("group", { name: /size/i });
    fireEvent.click(within(sizeGroup).getByRole("button", { name: "M" }));
    expect(addBtn.disabled).toBe(false); // size is the only remaining gate
  });

  it("keeps the carousel image unchanged when a colour is selected on a lifestyle-photo listing (no colour-tagged images)", () => {
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

// ── Colour → mockup carousel (per-colour mockups, e.g. referenced listings) ──
describe("ApparelProductView — colour selects its mockup", () => {
  const mockupDetail: ApparelDetail = {
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

  it("jumps the carousel to the matching colour mockup when a colour is selected", () => {
    render(<ApparelProductView detail={mockupDetail} />);
    expect((screen.getAllByRole("img")[0] as HTMLImageElement).src).toBe("https://blob/mockup-Evergreen.jpg");
    fireEvent.click(screen.getByRole("button", { name: /stone/i }));
    expect((screen.getAllByRole("img")[0] as HTMLImageElement).src).toBe("https://blob/mockup-Stone.jpg");
  });

  it("lets the user cycle the carousel manually without changing the selected colour or size", () => {
    render(<ApparelProductView detail={mockupDetail} />);
    // Select Stone (carousel jumps to the Stone mockup) and a size.
    fireEvent.click(screen.getByRole("button", { name: /stone/i }));
    const sizeGroup = screen.getByRole("group", { name: /size/i });
    fireEvent.click(within(sizeGroup).getByRole("button", { name: "M" }));

    // Manually view the first image (the Evergreen mockup) via its thumbnail.
    fireEvent.click(screen.getByRole("button", { name: /view image 1/i }));
    expect((screen.getAllByRole("img")[0] as HTMLImageElement).src).toBe("https://blob/mockup-Evergreen.jpg");

    // Selected colour (Stone) and size (M) are unchanged.
    expect(screen.getByRole("button", { name: /stone/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /evergreen/i }).getAttribute("aria-pressed")).toBe("false");
    expect(within(sizeGroup).getByRole("button", { name: "M" }).getAttribute("aria-pressed")).toBe("true");
  });
});
