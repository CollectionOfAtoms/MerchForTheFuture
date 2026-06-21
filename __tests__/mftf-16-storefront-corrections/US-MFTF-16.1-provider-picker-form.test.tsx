// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ProductTypeForm from "@/components/admin/ProductTypeForm";

// US-MFTF-16.1 — the designed-mode provider picker is Prodigi-only; Teemill is
// removed from the dropdown and an informational note region renders in its place.

afterEach(cleanup);

describe("US-MFTF-16.1 — ProductTypeForm provider picker", () => {
  it("offers Prodigi and does not offer Teemill", () => {
    render(<ProductTypeForm />);
    expect(screen.getByRole("option", { name: /prodigi/i })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /t-?mill/i })).toBeNull();
  });

  it("renders the referenced-listing informational note region", () => {
    render(<ProductTypeForm />);
    expect(screen.getByTestId("teemill-referenced-note")).toBeTruthy();
  });

  it("keeps the Prodigi SKU input", () => {
    const { container } = render(<ProductTypeForm />);
    expect(container.querySelector('input[name="providerSkuBase"]')).toBeTruthy();
  });
});
