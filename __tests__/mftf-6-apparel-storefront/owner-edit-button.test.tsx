// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import OwnerEditButton from "@/components/seller/OwnerEditButton";
import { isListingOwner } from "@/lib/seller/listing-status";

afterEach(cleanup);

describe("isListingOwner", () => {
  it("is true only when the viewer is the seller who owns the listing", () => {
    expect(isListingOwner("seller-1", "seller-1")).toBe(true);
    expect(isListingOwner("someone-else", "seller-1")).toBe(false);
    expect(isListingOwner(null, "seller-1")).toBe(false);
    expect(isListingOwner(undefined, "seller-1")).toBe(false);
  });
});

describe("OwnerEditButton", () => {
  it("renders an 'Edit this listing' link to the edit page", () => {
    render(<OwnerEditButton editHref="/seller/apparel/abc/edit" />);
    const link = screen.getByRole("link", { name: /edit this listing/i });
    expect(link.getAttribute("href")).toBe("/seller/apparel/abc/edit");
  });
});
