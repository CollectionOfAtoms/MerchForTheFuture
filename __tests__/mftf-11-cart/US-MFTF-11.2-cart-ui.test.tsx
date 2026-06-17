// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import type { ApparelDetail } from "@/lib/apparel/detail";

// Mock the cart server action + router so the client components can be rendered
// in jsdom without loading server-only modules.
const addToCartAction = vi.fn(async () => ({ success: true, count: 2 }));
const refresh = vi.fn();
vi.mock("@/app/actions/cart", () => ({ addToCartAction: (...args: unknown[]) => addToCartAction(...(args as [])) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { default: ApparelProductView } = await import("@/components/ApparelProductView");
const { default: CartBadge } = await import("@/components/CartBadge");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const detail: ApparelDetail = {
  id: "listing-1",
  title: "Solar Punk Bee",
  description: "A bee.",
  retailPrice: 28,
  images: [{ url: "https://blob/a.jpg", colorName: null }],
  colors: [
    { name: "White", hex: null, swatchImageUrl: "https://blob/swatch-White.png" },
    { name: "Evergreen", hex: "#1f3d2a", swatchImageUrl: null },
  ],
  sizes: ["S", "M", "L"],
};

describe("US-MFTF-11.2 — CartBadge", () => {
  it("renders no count badge when the cart is empty", () => {
    render(<CartBadge count={0} />);
    expect(screen.queryByTestId("cart-badge-count")).toBeNull();
    expect(screen.getByRole("link", { name: /cart/i })).toBeTruthy();
  });

  it("renders the item count when the cart is non-empty", () => {
    render(<CartBadge count={3} />);
    expect(screen.getByTestId("cart-badge-count").textContent).toBe("3");
    expect(screen.getByRole("link", { name: /3 items/i })).toBeTruthy();
  });

  it("links to the cart page", () => {
    render(<CartBadge count={1} />);
    expect(screen.getByRole("link", { name: /cart/i }).getAttribute("href")).toBe("/cart");
  });
});

describe("US-MFTF-11.2 — Add to cart button", () => {
  it("stays disabled until both a colour and a size are chosen", () => {
    render(<ApparelProductView detail={detail} />);
    const addBtn = screen.getByRole("button", { name: /add to cart/i }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /white/i }));
    expect(addBtn.disabled).toBe(true);
    const sizeGroup = screen.getByRole("group", { name: /size/i });
    fireEvent.click(within(sizeGroup).getByRole("button", { name: "M" }));
    expect(addBtn.disabled).toBe(false);
  });

  it("calls addToCartAction with the chosen colour identity and size, then refreshes", async () => {
    render(<ApparelProductView detail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: /evergreen/i }));
    const sizeGroup = screen.getByRole("group", { name: /size/i });
    fireEvent.click(within(sizeGroup).getByRole("button", { name: "L" }));
    fireEvent.click(screen.getByRole("button", { name: /add to cart/i }));

    await waitFor(() => expect(addToCartAction).toHaveBeenCalledOnce());
    expect(addToCartAction).toHaveBeenCalledWith({
      itemKind: "APPAREL",
      apparelListingId: "listing-1",
      selection: { colorId: "Evergreen", sizeLabel: "L" },
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toMatch(/added to cart/i);
  });

  it("shows an error message when the action returns an error", async () => {
    addToCartAction.mockResolvedValueOnce({ error: "That size is not available for this item." } as never);
    render(<ApparelProductView detail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: /white/i }));
    const sizeGroup = screen.getByRole("group", { name: /size/i });
    fireEvent.click(within(sizeGroup).getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByRole("button", { name: /add to cart/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/not available/i));
    expect(refresh).not.toHaveBeenCalled();
  });
});
