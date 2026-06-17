// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import type { CartView } from "@/lib/cart/cart";

const updateCartItemAction = vi.fn(async () => ({ success: true, count: 1 }));
const removeCartItemAction = vi.fn(async () => ({ success: true, count: 0 }));
const refresh = vi.fn();
vi.mock("@/app/actions/cart", () => ({
  updateCartItemAction: (...a: unknown[]) => updateCartItemAction(...(a as [])),
  removeCartItemAction: (...a: unknown[]) => removeCartItemAction(...(a as [])),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { default: CartContents } = await import("@/components/CartContents");
const { default: CartEmpty } = await import("@/components/CartEmpty");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const view: CartView = {
  items: [
    { id: "ci-1", kind: "APPAREL", title: "Solar Punk Bee", selectionSummary: "White · M", thumbnailUrl: "https://blob/grid.jpg", unitPrice: 28, quantity: 1, lineTotal: 28 },
    { id: "ci-2", kind: "PRINT", title: "Print Me", selectionSummary: "Fine Art Paper · 16x24", thumbnailUrl: null, unitPrice: 42, quantity: 2, lineTotal: 84 },
  ],
  subtotal: 112,
  itemCount: 3,
};

describe("US-MFTF-11.4 — CartEmpty", () => {
  it("links to /shop and /browse", () => {
    render(<CartEmpty />);
    expect(screen.getByText(/your cart is empty/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /shop apparel/i }).getAttribute("href")).toBe("/shop");
    expect(screen.getByRole("link", { name: /browse art/i }).getAttribute("href")).toBe("/browse");
  });
});

describe("US-MFTF-11.4 — CartContents", () => {
  it("renders kind badges, selection summaries, unit prices, and line totals", () => {
    render(<CartContents view={view} />);
    expect(screen.getByText("Apparel")).toBeTruthy();
    expect(screen.getByText("Print")).toBeTruthy();
    expect(screen.getByText("White · M")).toBeTruthy();
    expect(screen.getByText("Fine Art Paper · 16x24")).toBeTruthy();
    expect(screen.getByText("$84.00")).toBeTruthy();
  });

  it("shows the subtotal and the tax/shipping note", () => {
    render(<CartContents view={view} />);
    expect(screen.getByText("$112.00")).toBeTruthy();
    expect(screen.getByText(/shipping and tax are calculated at checkout/i)).toBeTruthy();
  });

  it("links 'Proceed to checkout' to /checkout", () => {
    render(<CartContents view={view} />);
    expect(screen.getByRole("link", { name: /proceed to checkout/i }).getAttribute("href")).toBe("/checkout");
  });

  it("disables the decrease button when quantity is 1 (stepper min is 1)", () => {
    render(<CartContents view={view} />);
    const rows = screen.getAllByRole("listitem");
    const apparelRow = rows[0];
    const dec = within(apparelRow).getByLabelText("Decrease quantity") as HTMLButtonElement;
    expect(dec.disabled).toBe(true);
  });

  it("calls updateCartItemAction with quantity+1 when increasing, then refreshes", async () => {
    render(<CartContents view={view} />);
    const rows = screen.getAllByRole("listitem");
    const printRow = rows[1]; // quantity 2
    fireEvent.click(within(printRow).getByLabelText("Increase quantity"));
    await waitFor(() => expect(updateCartItemAction).toHaveBeenCalledWith("ci-2", 3));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("calls removeCartItemAction when removing a line", async () => {
    render(<CartContents view={view} />);
    const rows = screen.getAllByRole("listitem");
    fireEvent.click(within(rows[0]).getByLabelText("Remove item"));
    await waitFor(() => expect(removeCartItemAction).toHaveBeenCalledWith("ci-1"));
  });
});
