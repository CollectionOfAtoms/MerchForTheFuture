// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("@/app/actions/listings", () => ({ updatePrintConfigAction: vi.fn() }));

const { default: PrintConfigForm } = await import("@/components/PrintConfigForm");

// 4:5 art (8×10). Catalog mixes a matching 4:5 size with non-matching 1:1 / 3:2 sizes.
const CATALOG = [
  { sku: "GLOBAL-FAP-8X10", description: "EMA 8x10", productDimensions: { width: 8, height: 10, units: "in" } },
  { sku: "GLOBAL-FAP-8X8", description: "EMA 8x8", productDimensions: { width: 8, height: 8, units: "in" } },
  { sku: "GLOBAL-FAP-12X18", description: "EMA 12x18", productDimensions: { width: 12, height: 18, units: "in" } },
];

function renderForm() {
  return render(
    <PrintConfigForm
      listingId="l1"
      initialEnabled={true}
      initialSourceUrl="https://cdn/src.jpg"
      primaryArtworkUrl="https://cdn/src.jpg"
      initialProducts={null}
      catalog={CATALOG}
      artworkDimensions={{ widthIn: 8, heightIn: 10 }}
      printCosts={{}}
    />,
  );
}

describe("PrintConfigForm — show all Prodigi sizes (seller option)", () => {
  it("defaults to only the aspect-matching sizes", () => {
    renderForm();
    // Only the 4:5 size (8×10) matches the artwork's proportions.
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText("8×10 in")).toBeInTheDocument();
    expect(screen.getByText(/match your artwork/i)).toBeInTheDocument();
  });

  it("reveals the full Prodigi catalog when 'Show all sizes' is clicked", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /show all sizes/i }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText("8×8 in")).toBeInTheDocument();
    expect(screen.getByText("12×18 in")).toBeInTheDocument();
    expect(screen.getByText(/showing all prodigi sizes/i)).toBeInTheDocument();
  });

  it("toggles back to matching-only", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /show all sizes/i }));
    fireEvent.click(screen.getByRole("button", { name: /show matching only/i }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("shows no sizes by default for an aspect with no within-10% match, then reveals all on toggle", () => {
    // A 2:1 piece (10×20) matches none of these ≤1.5-ratio catalog sizes.
    render(
      <PrintConfigForm
        listingId="l1"
        initialEnabled={true}
        initialSourceUrl="https://cdn/src.jpg"
        primaryArtworkUrl="https://cdn/src.jpg"
        initialProducts={null}
        catalog={CATALOG}
        artworkDimensions={{ widthIn: 10, heightIn: 20 }}
        printCosts={{}}
      />,
    );
    // Strict default: nothing matches → no size checkboxes (not the whole catalog).
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText(/no standard sizes match/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /show all sizes/i })[0]);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });
});
