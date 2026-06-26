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
  usLandedCost: null,
  snapshotFetchedAt: new Date("2026-06-13T00:00:00Z").toISOString(),
  colors: [
    { colorName: "Evergreen", colorHex: "#23312d" },
    { colorName: "Brown", colorHex: "#5a4632" },
  ],
  sizes: ["S", "M", "L"],
  images: [],
  carouselImages: [
    { url: "https://blob/ls-a.jpg", kind: "lifestyle" as const, label: null },
    { url: "https://images.podos.io/mock-evergreen.jpg", kind: "mockup" as const, label: "Evergreen" },
    { url: "https://images.podos.io/mock-brown.jpg", kind: "mockup" as const, label: "Brown" },
  ],
  editOnTeemillUrl:
    "https://teemill.com/create-a-product/powered-by-plants/?project=merchforthefuture-451391",
};

const thresholds = { amberAboveCents: 1500, redAboveCents: 2500 };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-MFTF-13.4 — EditReferencedListingForm", () => {
  it("renders a central carousel with the listing's images (lifestyle + mockups)", () => {
    render(<EditReferencedListingForm listing={listing} costThresholds={thresholds} />);
    // First image (lifestyle) shown in the main viewer + a thumbnail each.
    const imgs = screen.getAllByRole("img");
    const srcs = imgs.map((i) => i.getAttribute("src"));
    expect(srcs).toContain("https://blob/ls-a.jpg");
    expect(srcs).toContain("https://images.podos.io/mock-evergreen.jpg");
    // Prev/next controls appear when there is more than one image.
    expect(screen.getByRole("button", { name: /next image/i })).toBeInTheDocument();
  });

  it("renders editable merchandising fields (title, retail price)", () => {
    render(<EditReferencedListingForm listing={listing} costThresholds={thresholds} />);
    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe("Powered By Plants");
    expect((screen.getByLabelText(/retail price/i) as HTMLInputElement).value).toBe("32");
  });

  it("shows Teemill-owned colours and sizes as read-only (not editable inputs)", () => {
    render(<EditReferencedListingForm listing={listing} costThresholds={thresholds} />);
    expect(screen.getByText("Evergreen")).toBeInTheDocument();
    expect(screen.getByText(/S, M, L/)).toBeInTheDocument();
    // Colours are not rendered as toggle buttons/checkboxes here.
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("renders an 'Edit on Teemill' link that opens in a new tab using the stored fallback URL", () => {
    render(<EditReferencedListingForm listing={listing} costThresholds={thresholds} />);
    const link = screen.getByRole("link", { name: /edit on teemill/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("href", listing.editOnTeemillUrl);
  });

  it("offers a 'Re-sync from Teemill' control", () => {
    render(<EditReferencedListingForm listing={listing} costThresholds={thresholds} />);
    expect(screen.getByRole("button", { name: /re-?sync from teemill/i })).toBeInTheDocument();
  });

  it("guides the seller to re-sync after editing on Teemill", () => {
    render(<EditReferencedListingForm listing={listing} costThresholds={thresholds} />);
    expect(screen.getByText(/after editing on teemill, re-?sync/i)).toBeInTheDocument();
  });
});
