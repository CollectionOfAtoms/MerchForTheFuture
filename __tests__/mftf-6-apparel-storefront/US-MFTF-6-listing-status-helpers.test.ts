import { describe, it, expect } from "vitest";
import {
  listingStatusTransitions,
  listingStatusStyle,
  isPubliclyViewable,
  publicListingHref,
} from "@/lib/seller/listing-status";

describe("listingStatusTransitions", () => {
  it("offers Unlist + Archive from ACTIVE", () => {
    expect(listingStatusTransitions("ACTIVE").map((t) => t.target)).toEqual(["UNLISTED", "ARCHIVED"]);
  });
  it("offers Publish + Archive from UNLISTED", () => {
    expect(listingStatusTransitions("UNLISTED").map((t) => t.target)).toEqual(["ACTIVE", "ARCHIVED"]);
  });
  it("offers Publish from ARCHIVED", () => {
    expect(listingStatusTransitions("ARCHIVED").map((t) => t.target)).toEqual(["ACTIVE"]);
  });
  it("offers no transitions from SOLD", () => {
    expect(listingStatusTransitions("SOLD")).toEqual([]);
  });
});

describe("listingStatusStyle", () => {
  it("labels UNLISTED 'Unlisted'", () => {
    expect(listingStatusStyle("UNLISTED").label).toBe("Unlisted");
  });
  it("falls back to the raw status for unknown values", () => {
    expect(listingStatusStyle("WHATEVER").label).toBe("WHATEVER");
  });
});

describe("isPubliclyViewable", () => {
  it("artwork is viewable in any status (detail renders Sold/archived too)", () => {
    for (const s of ["ACTIVE", "UNLISTED", "ARCHIVED", "SOLD"]) {
      expect(isPubliclyViewable("ARTWORK", s)).toBe(true);
    }
  });
  it("apparel is viewable only when ACTIVE or UNLISTED", () => {
    expect(isPubliclyViewable("APPAREL", "ACTIVE")).toBe(true);
    expect(isPubliclyViewable("APPAREL", "UNLISTED")).toBe(true);
    expect(isPubliclyViewable("APPAREL", "ARCHIVED")).toBe(false);
    expect(isPubliclyViewable("APPAREL", "SOLD")).toBe(false);
  });
});

describe("publicListingHref", () => {
  it("links artwork to /artwork/[artworkId]", () => {
    expect(publicListingHref("ARTWORK", { listingId: "l1", artworkId: "a1" })).toBe("/artwork/a1");
  });
  it("links apparel to /shop/[listingId]", () => {
    expect(publicListingHref("APPAREL", { listingId: "l1" })).toBe("/shop/l1");
  });
});
