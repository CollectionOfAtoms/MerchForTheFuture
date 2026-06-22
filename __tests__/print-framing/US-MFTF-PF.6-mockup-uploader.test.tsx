// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const setSizeMockupAction = vi.fn();
const removeSizeMockupAction = vi.fn();
vi.mock("@/app/actions/listings", () => ({ setSizeMockupAction, removeSizeMockupAction }));
vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const { default: SizeMockupUploader } = await import("@/components/SizeMockupUploader");

const SIZES = [
  { sku: "GLOBAL-CAN-8X10", label: "8×10 in" },
  { sku: "GLOBAL-FAP-12X18", label: "12×18 in" },
];

describe("US-MFTF-PF.6 — SizeMockupUploader (component)", () => {
  beforeEach(() => {
    setSizeMockupAction.mockReset().mockResolvedValue({ success: true });
    removeSizeMockupAction.mockReset().mockResolvedValue({ success: true });
  });

  it("renders one control per offered size", () => {
    render(<SizeMockupUploader listingId="l1" sizes={SIZES} initialMockups={{}} />);
    expect(screen.getByTestId("mockup-row-GLOBAL-CAN-8X10")).toBeInTheDocument();
    expect(screen.getByTestId("mockup-row-GLOBAL-FAP-12X18")).toBeInTheDocument();
    expect(screen.getAllByText(/add mockup image/i)).toHaveLength(2);
  });

  it("shows the preview + replace/remove for a size that already has a mockup", () => {
    render(
      <SizeMockupUploader
        listingId="l1"
        sizes={SIZES}
        initialMockups={{ "GLOBAL-CAN-8X10": "https://blob/a.jpg" }}
      />,
    );
    const row = screen.getByTestId("mockup-row-GLOBAL-CAN-8X10");
    expect(row.querySelector("img")).toHaveAttribute("src", "https://blob/a.jpg");
    expect(screen.getByText(/replace/i)).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("removing a mockup calls the action and reverts the row to the add state", async () => {
    render(
      <SizeMockupUploader
        listingId="l1"
        sizes={SIZES}
        initialMockups={{ "GLOBAL-CAN-8X10": "https://blob/a.jpg" }}
      />,
    );
    fireEvent.click(screen.getByText("Remove"));
    await waitFor(() => expect(removeSizeMockupAction).toHaveBeenCalledWith("l1", "GLOBAL-CAN-8X10"));
    await waitFor(() => {
      const row = screen.getByTestId("mockup-row-GLOBAL-CAN-8X10");
      expect(row.querySelector("img")).toBeNull();
    });
  });
});
