import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: vi.fn().mockResolvedValue(undefined) }));

const { toggleApparelListingStatusAction, deleteApparelListingAction } = await import("@/app/actions/apparel");
const { auth } = await import("@/auth");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedListing({ status = "ACTIVE" as "ACTIVE" | "ARCHIVED" | "SOLD" } = {}) {
  const seller = await prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: ["SELLER"] as never },
  });
  const pt = await prisma.productType.create({
    data: {
      name: `Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "TEEMILL",
      providerSkuBase: "RNA1",
      colors: { create: [{ colorName: "White", providerColorCode: "White" }] },
    },
    include: { colors: true },
  });
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId: seller.id,
      productTypeId: pt.id,
      title: "Solar Punk Bee",
      retailPrice: 28,
      status,
      designImageUrl: "https://blob/design.png",
      colors: { create: [{ productTypeColorId: pt.colors[0].id, isOffered: true }] },
      images: { create: [{ originalUrl: "https://blob/ls.jpg", thumbnailUrl: "https://blob/ls-t.jpg", isPrimary: true, sortOrder: 0 }] },
    },
  });
  return { seller, pt, listing };
}

function authAs(id: string, roles: string[] = ["SELLER"]) {
  vi.mocked(auth).mockResolvedValue({ user: { id, roles } } as never);
}

async function statusOf(id: string) {
  return (await prisma.apparelListing.findUnique({ where: { id } }))?.status;
}

// ─── toggleApparelListingStatusAction ─────────────────────────────────────────

describe("toggleApparelListingStatusAction", () => {
  beforeEach(async () => { await resetDatabase(); });
  afterEach(async () => { await resetDatabase(); vi.restoreAllMocks(); });

  it("archives an active listing", async () => {
    const { seller, listing } = await seedListing({ status: "ACTIVE" });
    authAs(seller.id);
    await toggleApparelListingStatusAction(listing.id);
    expect(await statusOf(listing.id)).toBe("ARCHIVED");
  });

  it("reactivates an archived listing", async () => {
    const { seller, listing } = await seedListing({ status: "ARCHIVED" });
    authAs(seller.id);
    await toggleApparelListingStatusAction(listing.id);
    expect(await statusOf(listing.id)).toBe("ACTIVE");
  });

  it("does nothing to a SOLD listing", async () => {
    const { seller, listing } = await seedListing({ status: "SOLD" });
    authAs(seller.id);
    await toggleApparelListingStatusAction(listing.id);
    expect(await statusOf(listing.id)).toBe("SOLD");
  });

  it("does nothing when the caller does not own the listing", async () => {
    const { listing } = await seedListing({ status: "ACTIVE" });
    authAs("intruder");
    await toggleApparelListingStatusAction(listing.id);
    expect(await statusOf(listing.id)).toBe("ACTIVE");
  });

  it("does nothing for a non-seller", async () => {
    const { listing } = await seedListing({ status: "ACTIVE" });
    authAs("someone", ["BUYER"]);
    await toggleApparelListingStatusAction(listing.id);
    expect(await statusOf(listing.id)).toBe("ACTIVE");
  });
});

// ─── deleteApparelListingAction ───────────────────────────────────────────────

describe("deleteApparelListingAction", () => {
  beforeEach(async () => { await resetDatabase(); vi.clearAllMocks(); });
  afterEach(async () => { await resetDatabase(); vi.restoreAllMocks(); });

  it("deletes an active listing and cascades its colors and images", async () => {
    const { seller, listing } = await seedListing({ status: "ACTIVE" });
    authAs(seller.id);
    const result = await deleteApparelListingAction(listing.id);
    expect(result).toMatchObject({ success: true });
    expect(await prisma.apparelListing.findUnique({ where: { id: listing.id } })).toBeNull();
    expect(await prisma.apparelListingColor.count({ where: { apparelListingId: listing.id } })).toBe(0);
    expect(await prisma.apparelListingImage.count({ where: { apparelListingId: listing.id } })).toBe(0);
  });

  it("removes the design and lifestyle blobs", async () => {
    const { seller, listing } = await seedListing({ status: "ACTIVE" });
    authAs(seller.id);
    await deleteApparelListingAction(listing.id);
    const { del } = await import("@vercel/blob");
    expect(del).toHaveBeenCalledOnce();
    const urls = vi.mocked(del).mock.calls[0][0] as string[];
    expect(urls).toContain("https://blob/design.png");
    expect(urls).toContain("https://blob/ls.jpg");
  });

  it("refuses to delete a SOLD listing", async () => {
    const { seller, listing } = await seedListing({ status: "SOLD" });
    authAs(seller.id);
    const result = await deleteApparelListingAction(listing.id);
    expect(result).toMatchObject({ error: expect.stringMatching(/sold/i) });
    expect(await prisma.apparelListing.findUnique({ where: { id: listing.id } })).not.toBeNull();
  });

  it("refuses when the caller does not own the listing", async () => {
    const { listing } = await seedListing({ status: "ACTIVE" });
    authAs("intruder");
    const result = await deleteApparelListingAction(listing.id);
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(await prisma.apparelListing.findUnique({ where: { id: listing.id } })).not.toBeNull();
  });
});
