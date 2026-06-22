// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/app/actions/listings", () => ({ setCanvasWrapAction: vi.fn() }));

const { default: CanvasWrapPicker } = await import("@/components/CanvasWrapPicker");

describe("US-MFTF-PF.2 — CanvasWrapPicker (component)", () => {
  it("offers exactly MirrorWrap, Black, White (ImageWrap absent)", () => {
    render(<CanvasWrapPicker listingId="l1" aspectRatio="4:5" />);
    const radios = screen.getAllByRole("radio");
    const labels = radios.map((r) => r.textContent);
    expect(labels).toEqual(["Mirror wrap", "Black", "White"]);
    expect(screen.queryByText(/image wrap/i)).toBeNull();
  });

  it("pre-selects MirrorWrap when nothing is stored", () => {
    render(<CanvasWrapPicker listingId="l1" aspectRatio="4:5" />);
    const mirror = screen.getByRole("radio", { name: "Mirror wrap" });
    expect(mirror).toHaveAttribute("aria-checked", "true");
  });

  it("pre-selects the stored wrap when one exists", () => {
    render(<CanvasWrapPicker listingId="l1" aspectRatio="4:5" initialWrap="BLACK" />);
    expect(screen.getByRole("radio", { name: "Black" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Mirror wrap" })).toHaveAttribute("aria-checked", "false");
  });
});
