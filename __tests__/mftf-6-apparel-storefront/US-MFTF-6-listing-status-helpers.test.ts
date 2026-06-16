import { describe, it, expect } from "vitest";
import {
  listingStatusTransitions,
  listingStatusStyle,
  isPubliclyViewable,
  publicListingHref,
  shouldShowOwnerUnlistedNotice,
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

describe("shouldShowOwnerUnlistedNotice", () => {
  it("shows for the owning seller viewing their UNLISTED listing", () => {
    expect(shouldShowOwnerUnlistedNotice("seller1", "seller1", "UNLISTED")).toBe(true);
  });
  it("hides for an UNLISTED listing the viewer does not own", () => {
    expect(shouldShowOwnerUnlistedNotice("someone", "seller1", "UNLISTED")).toBe(false);
  });
  it("hides for anonymous visitors", () => {
    expect(shouldShowOwnerUnlistedNotice(null, "seller1", "UNLISTED")).toBe(false);
    expect(shouldShowOwnerUnlistedNotice(undefined, "seller1", "UNLISTED")).toBe(false);
  });
  it("hides when the listing is not UNLISTED, even for the owner", () => {
    expect(shouldShowOwnerUnlistedNotice("seller1", "seller1", "ACTIVE")).toBe(false);
  });
});
