// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// Server actions are mocked so the client component can render in jsdom.
const resolveTeemillRefAction = vi.fn();
const createReferencedListingAction = vi.fn();
vi.mock("@/app/actions/referenced-apparel", () => ({
  resolveTeemillRefAction: (...a: unknown[]) => resolveTeemillRefAction(...a),
  createReferencedListingAction: (...a: unknown[]) => createReferencedListingAction(...a),
}));
vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const TEEMILL_DESIGNER = "https://teemill.com/make/";

const { default: NewReferencedListingForm } = await import(
  "@/components/seller/NewReferencedListingForm"
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-MFTF-13.3 — NewReferencedListingForm Step 1 guidance", () => {
  it("instructs that the design is created on Teemill first, before any ref is entered", () => {
    render(<NewReferencedListingForm />);
    expect(screen.getByText(/on Teemill first/i)).toBeInTheDocument();
  });

  it("shows a prominent outbound link to Teemill's designer that opens in a new tab", () => {
    render(<NewReferencedListingForm />);
    const link = screen.getByRole("link", { name: /teemill/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("href")).toContain("teemill.com");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("explains how to copy the product ref from a finished Teemill product", () => {
    render(<NewReferencedListingForm />);
    expect(screen.getByText(/copy (its|the) (link|ref)/i)).toBeInTheDocument();
  });

  it("openly identifies Teemill as the provider (no seller opacity in referenced mode)", () => {
    render(<NewReferencedListingForm />);
    expect(screen.getAllByText(/Teemill/i).length).toBeGreaterThan(0);
  });

  it("re-surfaces the on-Teemill guidance when a ref cannot be resolved", async () => {
    resolveTeemillRefAction.mockResolvedValue({
      error: "We could not find that product in your Teemill project.",
    });
    render(<NewReferencedListingForm teemillDesignerUrl={TEEMILL_DESIGNER} />);

    fireEvent.change(screen.getByLabelText(/Teemill product link or ref/i), {
      target: { value: "bad-ref" },
    });
    fireEvent.click(screen.getByRole("button", { name: /resolve|look up|preview/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not find/i)).toBeInTheDocument();
    });
    // Guidance still present alongside the error.
    expect(screen.getByText(/on Teemill first/i)).toBeInTheDocument();
  });

  it("shows the resolved preview (title, colour swatches, GBP cost) after a successful resolve", async () => {
    resolveTeemillRefAction.mockResolvedValue({
      preview: {
        title: "Powered By Plants",
        description: "Organic cotton tee.",
        providerBaseCurrency: "GBP",
        providerBasePrice: 21,
        colors: [
          { colorName: "Evergreen", colorHex: "#23312d" },
          { colorName: "Brown", colorHex: "#5a4632" },
        ],
        sizes: ["S", "M", "L"],
        mockups: ["https://images.podos.io/mock-evergreen.jpg"],
        orderableCount: 6,
      },
    });
    render(<NewReferencedListingForm />);

    fireEvent.change(screen.getByLabelText(/Teemill product link or ref/i), {
      target: { value: "https://api.teemill.com/v1/catalog/products/x" },
    });
    fireEvent.click(screen.getByRole("button", { name: /resolve|look up|preview/i }));

    await waitFor(() => {
      expect(screen.getByText("Powered By Plants")).toBeInTheDocument();
    });
    // GBP cost labelled as founder margin context.
    expect(screen.getByText(/your cost/i)).toBeInTheDocument();
    expect(screen.getByText(/£?\s*21/)).toBeInTheDocument();
  });

  it("auto-populates the description field from the resolved Teemill product", async () => {
    resolveTeemillRefAction.mockResolvedValue({
      preview: {
        title: "Powered By Plants",
        description: "Organic cotton tee, printed on demand.",
        providerBaseCurrency: "GBP",
        providerBasePrice: 21,
        colors: [{ colorName: "Evergreen", colorHex: "#23312d" }],
        sizes: ["M"],
        mockups: [],
        orderableCount: 1,
      },
    });
    render(<NewReferencedListingForm />);

    fireEvent.change(screen.getByLabelText(/Teemill product link or ref/i), {
      target: { value: "https://api.teemill.com/v1/catalog/products/x" },
    });
    fireEvent.click(screen.getByRole("button", { name: /resolve|look up|preview/i }));

    await waitFor(() => {
      expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toBe(
        "Organic cotton tee, printed on demand.",
      );
    });
  });
});
