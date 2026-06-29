import { describe, it, expect, afterEach } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import { referencedListingCarousel } from "@/lib/apparel/referenced";

const { getApparelListingDetail } = await import("@/lib/apparel/detail");

// US-MFTF-19.1 — the apparel carousel shows the UNION of lifestyle photos then
// mockups (revises US-MFTF-6.2, which dropped mockups whenever a lifestyle photo
// existed). Ordering is deterministic: all lifestyle photos (stored order) then
// all mockups (stored order). First active slide = first lifestyle photo if any,
// else first mockup.

// ─── Pure-fn selector: referencedListingCarousel is the ordered media[] projection ──

describe("referencedListingCarousel (media-assembly selector)", () => {
  const lifestyle = [
    { displayUrl: "https://blob/life-1-display.jpg", originalUrl: "https://blob/life-1.jpg" },
    { displayUrl: null, originalUrl: "https://blob/life-2.jpg" },
  ];
  const variants = [
    { mockupUrl: "https://images.podos.io/mock-A.jpg", colorName: "Evergreen" },
    { mockupUrl: "https://images.podos.io/mock-A.jpg", colorName: "Evergreen" }, // dup colour/url
    { mockupUrl: "https://images.podos.io/mock-B.jpg", colorName: "Stone" },
  ];

  it("orders all lifestyle photos first (stored order), then distinct mockups (stored order)", () => {
    const media = referencedListingCarousel({ lifestyle, variants });
    expect(media.map((m) => m.url)).toEqual([
      "https://blob/life-1-display.jpg",
      "https://blob/life-2.jpg",
      "https://images.podos.io/mock-A.jpg",
      "https://images.podos.io/mock-B.jpg",
    ]);
    expect(media.map((m) => m.kind)).toEqual(["lifestyle", "lifestyle", "mockup", "mockup"]);
  });

  it("shows mockups only when there are zero lifestyle photos", () => {
    const media = referencedListingCarousel({ lifestyle: [], variants });
    expect(media.map((m) => m.url)).toEqual([
      "https://images.podos.io/mock-A.jpg",
      "https://images.podos.io/mock-B.jpg",
    ]);
  });

  it("shows lifestyle only when there are no mockups", () => {
    const media = referencedListingCarousel({ lifestyle, variants: [] });
    expect(media.map((m) => m.kind)).toEqual(["lifestyle", "lifestyle"]);
  });

  it("tags mockups with their colour and lifestyle photos with null", () => {
    const media = referencedListingCarousel({ lifestyle, variants });
    expect(media.find((m) => m.url === "https://images.podos.io/mock-A.jpg")?.label).toBe("Evergreen");
    expect(media.filter((m) => m.kind === "lifestyle").every((m) => m.label === null)).toBe(true);
  });
});

// ─── Integration: getApparelListingDetail returns the union ─────────────────────

async function seedSeller() {
  return prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: ["SELLER"] as never },
  });
}

async function seedReferencedListing(
  sellerId: string,
  { colors = ["Evergreen", "Stone"], sizes = ["S", "M"], withLifestylePhoto = false } = {},
) {
  return prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "REFERENCED",
      title: "Powered By Plants",
      retailPrice: 32,
      status: "ACTIVE",
      providerKey: "teemill",
      providerProductRef: `ref-${crypto.randomUUID()}`,
      referencedVariants: {
        create: colors.flatMap((c) =>
          sizes.map((size) => ({
            variantRef: `https://api.teemill.com/v1/catalog/variants/${crypto.randomUUID()}`,
            colorName: c,
            colorHex: `#${c.length}${c.length}aabb`,
            sizeLabel: size,
            stockLevel: 5,
            isOrderable: true,
            mockupUrl: `https://images.podos.io/mockup-${c}.jpg`,
          })),
        ),
      },
      ...(withLifestylePhoto
        ? { images: { create: [{ originalUrl: "https://blob/ref.jpg", displayUrl: "https://blob/ref-display.jpg", isPrimary: true, sortOrder: 0 }] } }
        : {}),
    },
  });
}

describe("getApparelListingDetail — carousel union (US-MFTF-19.1)", () => {
  afterEach(async () => { await resetDatabase(); });

  it("appends mockups after lifestyle photos instead of dropping them", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id, { withLifestylePhoto: true });
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.images.map((i) => i.url)).toEqual([
      "https://blob/ref-display.jpg",
      "https://images.podos.io/mockup-Evergreen.jpg",
      "https://images.podos.io/mockup-Stone.jpg",
    ]);
    // First slide is the lifestyle photo; mockups keep their colour tag for the
    // colour→image jump in ApparelProductView.
    expect(detail!.images[0].colorName).toBeNull();
    expect(detail!.images[1].colorName).toBe("Evergreen");
  });

  it("falls back to mockups when a referenced listing has no lifestyle photos", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id, { withLifestylePhoto: false });
    const detail = await getApparelListingDetail(listing.id);
    expect(detail!.images.map((i) => i.url)).toEqual([
      "https://images.podos.io/mockup-Evergreen.jpg",
      "https://images.podos.io/mockup-Stone.jpg",
    ]);
  });
});
