// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import ProductTypeForm from "@/components/admin/ProductTypeForm";

// US-MFTF-17.5 — the admin form's Printify branch takes a catalog URL, looks it up,
// and shows the blueprint's stock images + a print-provider picker. The resolved
// blueprint id + the chosen provider id are submitted (hidden), so the existing
// createProductTypeAction path is unchanged.

const resolvePrintifyUrlAction = vi.fn();
vi.mock("@/app/actions/admin/product-catalog", () => ({ resolvePrintifyUrlAction: (...a: unknown[]) => resolvePrintifyUrlAction(...a) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function selectPrintify() {
  fireEvent.change(screen.getByRole("combobox", { name: /fulfillment provider/i }), {
    target: { value: "PRINTIFY" },
  });
}

const PREVIEW = {
  preview: {
    blueprintId: 1580,
    title: "Women's Baby Tee",
    brand: "Generic brand",
    model: "",
    images: ["https://images.printify.com/a", "https://images.printify.com/b"],
    // Already ordered Printify-Choice-first by the action; each carries a location.
    providers: [
      { id: 99, title: "Printify Choice", location: "Miami, FL, US" },
      { id: 217, title: "Fulfill Engine", location: "Monroe, NC, US" },
    ],
  },
};

describe("US-MFTF-17.5 — ProductTypeForm Printify URL lookup", () => {
  it("offers a URL field (not raw id inputs) when Printify is selected", () => {
    render(<ProductTypeForm />);
    selectPrintify();
    expect(screen.getByLabelText(/printify.*(url|link)/i)).toBeTruthy();
  });

  it("looks up the URL and shows the stock images + provider picker", async () => {
    resolvePrintifyUrlAction.mockResolvedValue(PREVIEW);
    const { container } = render(<ProductTypeForm />);
    selectPrintify();

    fireEvent.change(screen.getByLabelText(/printify.*(url|link)/i), {
      target: { value: "https://printify.com/app/products/1580/generic-brand/womens-baby-tee" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look ?up|resolve/i }));

    // Stock images render.
    await waitFor(() => {
      const imgs = container.querySelectorAll('img[src^="https://images.printify.com/"]');
      expect(imgs.length).toBe(2);
    });
    // Provider picker is populated from the resolved providers, with each engine's
    // location shown in its option label.
    expect(screen.getByRole("option", { name: /printify choice.*miami/i })).toBeTruthy();
    expect(screen.getByRole("option", { name: /fulfill engine.*monroe/i })).toBeTruthy();
    // Printify Choice (first in the resolved list) is the default selection.
    const select = container.querySelector('select[name="printifyPrintProviderId"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("99");
    // The resolved blueprint id is submitted (hidden).
    expect((container.querySelector('[name="printifyBlueprintId"]') as HTMLInputElement).value).toBe("1580");
  });

  it("surfaces a resolve error", async () => {
    resolvePrintifyUrlAction.mockResolvedValue({ error: "No Printify blueprint found for id 999." });
    render(<ProductTypeForm />);
    selectPrintify();
    fireEvent.change(screen.getByLabelText(/printify.*(url|link)/i), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: /look ?up|resolve/i }));
    await waitFor(() => expect(screen.getByText(/no printify blueprint found/i)).toBeTruthy());
  });
});
