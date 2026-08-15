// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ApparelProductTypeOption } from "@/lib/apparel/listings";

// US-MFTF-17.6 — the seller listing form shows the product's stock images as design
// reference so sellers can see what they're designing onto.

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));
vi.mock("@/app/actions/apparel", () => ({ createApparelListingAction: vi.fn() }));
vi.mock("@/components/seller/DesignFilePreview", () => ({ DesignFilePreview: () => null }));

import NewApparelListingForm from "@/components/seller/NewApparelListingForm";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TYPE_WITH_IMAGES: ApparelProductTypeOption = {
  id: "pt-1",
  name: "Women's Baby Tee",
  description: null,
  stockImages: ["https://images.printify.com/a", "https://images.printify.com/b"],
  colors: [{ id: "c1", colorName: "Black", colorImageUrl: null }],
  sizes: [{ id: "s1", sizeLabel: "M", sortOrder: 0 }],
};

describe("US-MFTF-17.6 — seller design reference images", () => {
  it("renders the selected product type's stock images", () => {
    const { container } = render(<NewApparelListingForm productTypes={[TYPE_WITH_IMAGES]} />);
    const region = screen.getByTestId("product-reference-images");
    expect(region).toBeTruthy();
    const imgs = container.querySelectorAll('[data-testid="product-reference-images"] img[src^="https://images.printify.com/"]');
    expect(imgs.length).toBe(2);
  });

  it("shows no reference region when the product type has no stock images", () => {
    render(<NewApparelListingForm productTypes={[{ ...TYPE_WITH_IMAGES, stockImages: [] }]} />);
    expect(screen.queryByTestId("product-reference-images")).toBeNull();
  });
});
