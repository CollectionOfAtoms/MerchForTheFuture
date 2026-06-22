// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("@/app/actions/cart", () => ({ addToCartAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { default: PrintOptionsSelector } = await import("@/components/PrintOptionsSelector");

const PRODUCTS = [
  { sku: "GLOBAL-CAN-8X10", size: "8×10 in", price: 90 },
  { sku: "GLOBAL-CAN-16X20", size: "16×20 in", price: 160 },
];

describe("US-MFTF-PF.7 — buyer sees per-size mockup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the selected size's seller mockup", () => {
    render(
      <PrintOptionsSelector
        listingId="l1"
        printProducts={PRODUCTS}
        mockupsBySku={{ "GLOBAL-CAN-8X10": "https://blob/m-8x10.jpg", "GLOBAL-CAN-16X20": "https://blob/m-16x20.jpg" }}
        fallbackImageUrl="https://blob/primary.jpg"
      />,
    );
    expect(screen.getByTestId("print-mockup-preview")).toHaveAttribute("src", "https://blob/m-8x10.jpg");
  });

  it("swaps the mockup when the buyer changes size", () => {
    render(
      <PrintOptionsSelector
        listingId="l1"
        printProducts={PRODUCTS}
        mockupsBySku={{ "GLOBAL-CAN-8X10": "https://blob/m-8x10.jpg", "GLOBAL-CAN-16X20": "https://blob/m-16x20.jpg" }}
        fallbackImageUrl="https://blob/primary.jpg"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "16×20 in" }));
    expect(screen.getByTestId("print-mockup-preview")).toHaveAttribute("src", "https://blob/m-16x20.jpg");
  });

  it("falls back to the listing primary image when a size has no mockup (no broken image)", () => {
    render(
      <PrintOptionsSelector
        listingId="l1"
        printProducts={PRODUCTS}
        mockupsBySku={{ "GLOBAL-CAN-16X20": "https://blob/m-16x20.jpg" }} // 8×10 missing
        fallbackImageUrl="https://blob/primary.jpg"
      />,
    );
    // default selection is the first size (8×10), which has no mockup → fallback
    expect(screen.getByTestId("print-mockup-preview")).toHaveAttribute("src", "https://blob/primary.jpg");
  });

  it("makes no network request for buyer mockup display", () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}"));
    render(
      <PrintOptionsSelector
        listingId="l1"
        printProducts={PRODUCTS}
        mockupsBySku={{ "GLOBAL-CAN-8X10": "https://blob/m-8x10.jpg" }}
        fallbackImageUrl="https://blob/primary.jpg"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "16×20 in" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
