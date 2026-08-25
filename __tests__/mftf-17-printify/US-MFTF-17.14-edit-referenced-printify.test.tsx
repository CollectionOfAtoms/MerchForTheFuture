// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// US-MFTF-17.14 (edit surface) — a referenced Printify listing's edit page must name
// PRINTIFY, not Teemill, everywhere: the "From …" banner, the "Edit on …" link, the
// "Re-sync from …" button, the guidance, and the USD ($) cost line.

const updateReferencedListingAction = vi.fn();
const resyncReferencedListingAction = vi.fn();
const setMockupBackgroundAction = vi.fn();
vi.mock("@/app/actions/referenced-apparel", () => ({
  updateReferencedListingAction: (...a: unknown[]) => updateReferencedListingAction(...a),
  resyncReferencedListingAction: (...a: unknown[]) => resyncReferencedListingAction(...a),
  setMockupBackgroundAction: (...a: unknown[]) => setMockupBackgroundAction(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { default: EditReferencedListingForm } = await import(
  "@/components/seller/EditReferencedListingForm"
);

const PRINTIFY_EDIT_URL = "https://printify.com/app/editor/6579fa1c8b3e4a0011ab77cd";

const listing = {
  id: "listing-p",
  sellerId: "seller-1",
  title: "Protect Our Oceans",
  description: "Recycled tee",
  retailPrice: 40,
  status: "ACTIVE" as const,
  sourcingMode: "REFERENCED" as const,
  providerKey: "printify",
  providerProductRef: "6579fa1c8b3e4a0011ab77cd",
  providerBaseCurrency: "USD",
  providerBasePrice: 22,
  usLandedCost: null,
  mockupBackgrounds: null,
  snapshotFetchedAt: new Date("2026-08-25T00:00:00Z").toISOString(),
  colors: [{ colorName: "Heather Grey", colorHex: "#b8bcc2" }],
  sizes: ["S", "M"],
  images: [],
  carouselImages: [
    { url: "https://images.printify.com/mock-hg.png", kind: "mockup" as const, label: "Heather Grey" },
  ],
  providerEditUrl: PRINTIFY_EDIT_URL,
};

const thresholds = { amberAboveCents: 1500, redAboveCents: 2500 };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-MFTF-17.14 — EditReferencedListingForm names Printify (not Teemill)", () => {
  it("labels the provider banner 'From Printify' and never says Teemill", () => {
    render(<EditReferencedListingForm listing={listing} costThresholds={thresholds} />);
    expect(screen.getByRole("heading", { name: /from printify/i })).toBeInTheDocument();
    expect(screen.queryByText(/Teemill/i)).toBeNull();
  });

  it("renders an 'Edit on Printify' link to the product editor URL", () => {
    render(<EditReferencedListingForm listing={listing} costThresholds={thresholds} />);
    const link = screen.getByRole("link", { name: /edit on printify/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("href", PRINTIFY_EDIT_URL);
  });

  it("offers a 'Re-sync from Printify' control and guidance", () => {
    render(<EditReferencedListingForm listing={listing} costThresholds={thresholds} />);
    expect(screen.getByRole("button", { name: /re-?sync from printify/i })).toBeInTheDocument();
    expect(screen.getByText(/after editing on printify, re-?sync/i)).toBeInTheDocument();
  });

  it("shows the base cost in USD ($), not GBP (£)", () => {
    render(<EditReferencedListingForm listing={listing} costThresholds={thresholds} />);
    const cost = screen.getByText(/your cost/i);
    expect(cost.textContent).toContain("$22.00");
    expect(cost.textContent).not.toContain("£");
    expect(cost.textContent).toContain("Printify");
  });
});
