// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const updateReferencedListingAction = vi.fn();
const resyncReferencedListingAction = vi.fn();
vi.mock("@/app/actions/referenced-apparel", () => ({
  updateReferencedListingAction: (...a: unknown[]) => updateReferencedListingAction(...a),
  resyncReferencedListingAction: (...a: unknown[]) => resyncReferencedListingAction(...a),
}));

const { default: EditReferencedListingForm } = await import(
  "@/components/seller/EditReferencedListingForm"
);

const listing = {
  id: "listing-1",
  sellerId: "seller-1",
  title: "Powered By Plants",
  description: "Organic cotton tee",
  retailPrice: 32,
  status: "ACTIVE" as const,
  sourcingMode: "REFERENCED" as const,
  providerKey: "teemill",
  providerProductRef: "https://api.teemill.com/v1/catalog/products/x",
  providerBaseCurrency: "GBP",
  providerBasePrice: 21,
  snapshotFetchedAt: new Date("2026-06-13T00:00:00Z").toISOString(),
  colors: [
    { colorName: "Evergreen", colorHex: "#23312d" },
    { colorName: "Brown", colorHex: "#5a4632" },
  ],
  sizes: ["S", "M", "L"],
  images: [],
  editOnTeemillUrl: "https://teemill.com/account/",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-MFTF-13.4 — EditReferencedListingForm", () => {
  it("renders editable merchandising fields (title, retail price)", () => {
    render(<EditReferencedListingForm listing={listing} />);
    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe("Powered By Plants");
    expect((screen.getByLabelText(/retail price/i) as HTMLInputElement).value).toBe("32");
  });

  it("shows Teemill-owned colours and sizes as read-only (not editable inputs)", () => {
    render(<EditReferencedListingForm listing={listing} />);
    expect(screen.getByText("Evergreen")).toBeInTheDocument();
    expect(screen.getByText(/S, M, L/)).toBeInTheDocument();
    // Colours are not rendered as toggle buttons/checkboxes here.
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("renders an 'Edit on Teemill' link that opens in a new tab using the stored fallback URL", () => {
    render(<EditReferencedListingForm listing={listing} />);
    const link = screen.getByRole("link", { name: /edit on teemill/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("href", "https://teemill.com/account/");
  });

  it("offers a 'Re-sync from Teemill' control", () => {
    render(<EditReferencedListingForm listing={listing} />);
    expect(screen.getByRole("button", { name: /re-?sync from teemill/i })).toBeInTheDocument();
  });

  it("guides the seller to re-sync after editing on Teemill", () => {
    render(<EditReferencedListingForm listing={listing} />);
    expect(screen.getByText(/after editing on teemill, re-?sync/i)).toBeInTheDocument();
  });
});
