import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import {
  resolveMockupBackground,
  DEFAULT_MOCKUP_BACKGROUND,
  MOCKUP_BACKGROUND_SWATCHES,
} from "@/lib/apparel/mockup-background";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { setMockupBackgroundAction } = await import("@/app/actions/referenced-apparel");
const { auth } = await import("@/auth");
const mockedAuth = vi.mocked(auth);

// ─── Pure resolver: renderer treats stored values as opaque ─────────────────────

describe("resolveMockupBackground", () => {
  it("falls back to the default (white) when unset or no key present", () => {
    expect(resolveMockupBackground(null, "Stone")).toBe(DEFAULT_MOCKUP_BACKGROUND);
    expect(resolveMockupBackground({}, "Stone")).toBe(DEFAULT_MOCKUP_BACKGROUND);
    expect(DEFAULT_MOCKUP_BACKGROUND).toBe("#ffffff");
  });

  it("returns the stored value for a known mockup", () => {
    expect(resolveMockupBackground({ Stone: "#000000" }, "Stone")).toBe("#000000");
  });

  it("renders any stored color opaquely — no coupling to the five picker swatches", () => {
    // A value outside the swatch set still renders (picker/renderer share no enum).
    expect(resolveMockupBackground({ Stone: "rebeccapurple" }, "Stone")).toBe("rebeccapurple");
    expect(resolveMockupBackground({ Stone: "#abc123" }, "Stone")).toBe("#abc123");
  });

  it("offers exactly five picker swatches (white, black, three greys)", () => {
    expect(MOCKUP_BACKGROUND_SWATCHES).toHaveLength(5);
    expect(MOCKUP_BACKGROUND_SWATCHES.map((s) => s.value.toLowerCase())).toContain("#ffffff");
    expect(MOCKUP_BACKGROUND_SWATCHES.map((s) => s.value.toLowerCase())).toContain("#000000");
  });
});

// ─── Server action: round-trip persistence, auth-gated ──────────────────────────

async function seedSeller() {
  return prisma.user.create({ data: { email: `s-${crypto.randomUUID()}@t.com`, name: "S", roles: ["SELLER"] as never } });
}

async function seedReferencedListing(sellerId: string) {
  return prisma.apparelListing.create({
    data: {
      sellerId, sourcingMode: "REFERENCED", title: "Tee", retailPrice: 32, status: "ACTIVE",
      providerKey: "teemill", providerProductRef: `ref-${crypto.randomUUID()}`,
      referencedVariants: { create: [
        { variantRef: `https://api.teemill.com/v1/catalog/variants/${crypto.randomUUID()}`, colorName: "Stone", colorHex: "#d6d3d1", sizeLabel: "M", stockLevel: 5, isOrderable: true, mockupUrl: "https://images.podos.io/stone.jpg" },
      ] },
    },
  });
}

describe("US-MFTF-19.7 — setMockupBackgroundAction", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => vi.clearAllMocks());

  it("round-trips a per-mockup background keyed by colorName", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    mockedAuth.mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);

    const res = await setMockupBackgroundAction(listing.id, "Stone", "#000000");
    expect(res).toMatchObject({ success: true });
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect((row!.mockupBackgrounds as Record<string, string>).Stone).toBe("#000000");
  });

  it("stores an arbitrary color value opaquely (no enum coupling)", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    mockedAuth.mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);

    await setMockupBackgroundAction(listing.id, "Stone", "rebeccapurple");
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect((row!.mockupBackgrounds as Record<string, string>).Stone).toBe("rebeccapurple");
  });

  it("clears a background back to default when given an empty value", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    await prisma.apparelListing.update({ where: { id: listing.id }, data: { mockupBackgrounds: { Stone: "#000000" } } });
    mockedAuth.mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);

    await setMockupBackgroundAction(listing.id, "Stone", "");
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    const map = (row!.mockupBackgrounds ?? {}) as Record<string, string>;
    expect(map.Stone).toBeUndefined();
  });

  it("is auth-gated to the listing's seller", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    mockedAuth.mockResolvedValue({ user: { id: "intruder", roles: ["SELLER"] } } as never);

    const res = await setMockupBackgroundAction(listing.id, "Stone", "#000000");
    expect(res).toMatchObject({ error: expect.any(String) });
    const row = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(row!.mockupBackgrounds).toBeNull();
  });

  it("never modifies the stored mockup image URL", async () => {
    const seller = await seedSeller();
    const listing = await seedReferencedListing(seller.id);
    mockedAuth.mockResolvedValue({ user: { id: seller.id, roles: ["SELLER"] } } as never);

    await setMockupBackgroundAction(listing.id, "Stone", "#000000");
    const variant = await prisma.referencedVariant.findFirst({ where: { apparelListingId: listing.id } });
    expect(variant!.mockupUrl).toBe("https://images.podos.io/stone.jpg");
  });
});
