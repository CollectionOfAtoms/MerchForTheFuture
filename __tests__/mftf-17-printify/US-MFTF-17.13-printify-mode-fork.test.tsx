// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// Server actions are mocked so the client components render in jsdom.
const resolveTeemillRefAction = vi.fn();
const createReferencedListingAction = vi.fn();
const resolvePrintifyRefAction = vi.fn();
const createReferencedPrintifyListingAction = vi.fn();
vi.mock("@/app/actions/referenced-apparel", () => ({
  resolveTeemillRefAction: (...a: unknown[]) => resolveTeemillRefAction(...a),
  createReferencedListingAction: (...a: unknown[]) => createReferencedListingAction(...a),
  resolvePrintifyRefAction: (...a: unknown[]) => resolvePrintifyRefAction(...a),
  createReferencedPrintifyListingAction: (...a: unknown[]) => createReferencedPrintifyListingAction(...a),
}));
vi.mock("@/app/actions/apparel", () => ({ createApparelListingAction: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const { default: NewReferencedListingForm } = await import(
  "@/components/seller/NewReferencedListingForm"
);
const { default: NewApparelListingForm } = await import(
  "@/components/seller/NewApparelListingForm"
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Referenced form: Teemill / Printify provider fork ────────────────────────

describe("US-MFTF-17.13 — referenced form provider fork", () => {
  it("offers both Teemill and Printify as referenced providers", () => {
    render(<NewReferencedListingForm />);
    expect(screen.getByRole("button", { name: /^teemill$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^printify$/i })).toBeInTheDocument();
  });

  it("defaults to Teemill (existing 13.3 behaviour is unchanged)", () => {
    render(<NewReferencedListingForm />);
    expect(screen.getByLabelText(/Teemill product link or ref/i)).toBeInTheDocument();
    expect(screen.getByText(/on Teemill first/i)).toBeInTheDocument();
  });

  it("switches to a Printify branch (own field + guidance + outbound link) when Printify is chosen", () => {
    render(<NewReferencedListingForm />);
    fireEvent.click(screen.getByRole("button", { name: /^printify$/i }));

    expect(screen.getByLabelText(/Printify product link or id/i)).toBeInTheDocument();
    expect(screen.getByText(/in Printify first/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /printify/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("href")).toContain("printify");
  });

  it("resolves a Printify product and previews its mockups (USD cost)", async () => {
    resolvePrintifyRefAction.mockResolvedValue({
      preview: {
        title: "Protect Our Oceans",
        description: "Recycled tee.",
        providerBaseCurrency: "USD",
        providerBasePrice: 22,
        colors: [{ colorName: "Heather Grey", colorHex: "#b8bcc2" }],
        sizes: ["S", "M"],
        mockups: ["https://images.printify.com/mockup/heather-grey.png"],
        orderableCount: 3,
      },
    });
    render(<NewReferencedListingForm />);
    fireEvent.click(screen.getByRole("button", { name: /^printify$/i }));

    fireEvent.change(screen.getByLabelText(/Printify product link or id/i), {
      target: { value: "https://printify.com/app/store/products/abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /resolve|look up|preview/i }));

    await waitFor(() => {
      expect(screen.getByText("Protect Our Oceans")).toBeInTheDocument();
    });
    expect(resolvePrintifyRefAction).toHaveBeenCalled();
    expect(resolveTeemillRefAction).not.toHaveBeenCalled();
    // USD cost shown ($), not GBP.
    expect(screen.getByText(/\$\s*22/)).toBeInTheDocument();
  });
});

// ─── Designed form: Printify → "referenced is preferred" note ─────────────────

const printifyType = {
  id: "pt-printify",
  name: "Recycled Tee",
  isPrintify: true,
  colors: [{ id: "c1", colorName: "Black", colorImageUrl: null }],
  sizes: [{ sizeLabel: "M", sortOrder: 0 }],
  stockImages: [],
} as never;
const prodigiType = {
  id: "pt-prodigi",
  name: "Classic Tee",
  isPrintify: false,
  colors: [{ id: "c2", colorName: "White", colorImageUrl: null }],
  sizes: [{ sizeLabel: "M", sortOrder: 0 }],
  stockImages: [],
} as never;

describe("US-MFTF-17.13 — designed form recommends referenced for Printify", () => {
  it("shows a 'referenced is preferred (automatic mockups)' note when a Printify type is selected", () => {
    render(<NewApparelListingForm productTypes={[printifyType]} />);
    expect(screen.getByText(/automatic per-colour mockups/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /referenced printify listing/i }),
    ).toHaveAttribute("href", "/seller/apparel/new-referenced");
  });

  it("shows no such note for a non-Printify (Prodigi) product type", () => {
    render(<NewApparelListingForm productTypes={[prodigiType]} />);
    expect(screen.queryByText(/automatic mockups/i)).not.toBeInTheDocument();
  });
});
