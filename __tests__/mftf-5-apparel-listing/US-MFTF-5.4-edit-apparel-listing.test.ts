import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: vi.fn().mockResolvedValue(undefined) }));

const {
  updateApparelListingAction,
  addApparelImageAction,
  deleteApparelImageAction,
  setApparelPrimaryImageAction,
  replaceApparelDesignAction,
} = await import("@/app/actions/apparel");
const { getApparelListingForEdit } = await import("@/lib/apparel/listings");
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
      colors: {
        create: [
          { colorName: "White", providerColorCode: "White", colorImageUrl: "https://img/white.jpg" },
          { colorName: "Black", providerColorCode: "Black", colorImageUrl: "https://img/black.jpg" },
          { colorName: "Forest", providerColorCode: "Forest", colorImageUrl: "https://img/forest.jpg" },
        ],
      },
      sizes: { create: [{ sizeLabel: "M", providerSizeCode: "M", sortOrder: 1 }] },
    },
    include: { colors: { orderBy: { colorName: "asc" } } },
  });
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId: seller.id,
      productTypeId: pt.id,
      title: "Original Title",
      description: "Original description",
      retailPrice: 28,
      status,
      designImageUrl: "https://blob.vercel.com/apparel/design/orig.png",
      // Offer the first two colors (Black, Forest by asc name).
      colors: {
        create: [
          { productTypeColorId: pt.colors[0].id, isOffered: true },
          { productTypeColorId: pt.colors[1].id, isOffered: true },
        ],
      },
      images: {
        create: [
          { originalUrl: "https://blob.vercel.com/apparel/ls/a.jpg", isPrimary: true, sortOrder: 0 },
          { originalUrl: "https://blob.vercel.com/apparel/ls/b.jpg", isPrimary: false, sortOrder: 1 },
        ],
      },
    },
    include: { colors: true, images: { orderBy: { sortOrder: "asc" } } },
  });
  return { seller, pt, listing };
}

function authAs(id: string, roles: string[] = ["SELLER"]) {
  vi.mocked(auth).mockResolvedValue({ user: { id, roles } } as never);
}

function makeUpdateForm(fields: {
  title?: string;
  description?: string;
  retailPrice?: string;
  colorIds?: string[];
  productTypeId?: string;
}): FormData {
  const fd = new FormData();
  if (fields.title !== undefined) fd.set("title", fields.title);
  if (fields.description !== undefined) fd.set("description", fields.description);
  if (fields.retailPrice !== undefined) fd.set("retailPrice", fields.retailPrice);
  if (fields.productTypeId !== undefined) fd.set("productTypeId", fields.productTypeId);
  for (const id of fields.colorIds ?? []) fd.append("offeredColorId", id);
  return fd;
}

// ─── updateApparelListingAction ───────────────────────────────────────────────

describe("US-MFTF-5.4 — updateApparelListingAction", () => {
  beforeEach(async () => { await resetDatabase(); });
  afterEach(async () => { await resetDatabase(); vi.restoreAllMocks(); });

  it("returns Unauthorized for a non-seller", async () => {
    const { seller, pt, listing } = await seedListing();
    authAs("buyer-1", ["BUYER"]);
    const offered = await prisma.apparelListingColor.findMany({ where: { apparelListingId: listing.id } });
    const result = await updateApparelListingAction(
      listing.id, undefined,
      makeUpdateForm({ title: "x", retailPrice: "30", colorIds: offered.map((c) => c.productTypeColorId) }),
    );
    expect(result).toEqual({ error: "Unauthorized" });
    void seller; void pt;
  });

  it("returns an error when the seller does not own the listing", async () => {
    const { listing } = await seedListing();
    authAs("another-seller");
    const result = await updateApparelListingAction(
      listing.id, undefined, makeUpdateForm({ title: "x", retailPrice: "30", colorIds: ["whatever"] }),
    );
    expect(result).toMatchObject({ error: expect.stringMatching(/not found|unauthorized/i) });
  });

  it("rejects edits to a SOLD listing (read-only)", async () => {
    const { seller, pt, listing } = await seedListing({ status: "SOLD" });
    authAs(seller.id);
    const result = await updateApparelListingAction(
      listing.id, undefined,
      makeUpdateForm({ title: "x", retailPrice: "30", colorIds: [pt.colors[0].id] }),
    );
    expect(result).toMatchObject({ error: expect.stringMatching(/sold|read-only/i) });
  });

  it("rejects an attempt to change the product type", async () => {
    const { seller, pt, listing } = await seedListing();
    authAs(seller.id);
    const result = await updateApparelListingAction(
      listing.id, undefined,
      makeUpdateForm({ title: "x", retailPrice: "30", colorIds: [pt.colors[0].id], productTypeId: "different-pt" }),
    );
    expect(result).toMatchObject({ error: expect.stringMatching(/product type/i) });
  });

  it("rejects removing the last offered color", async () => {
    const { seller, listing } = await seedListing();
    authAs(seller.id);
    const result = await updateApparelListingAction(
      listing.id, undefined, makeUpdateForm({ title: "x", retailPrice: "30", colorIds: [] }),
    );
    expect(result).toMatchObject({ error: expect.stringMatching(/color/i) });
  });

  it("rejects a missing title", async () => {
    const { seller, pt, listing } = await seedListing();
    authAs(seller.id);
    const result = await updateApparelListingAction(
      listing.id, undefined, makeUpdateForm({ title: "", retailPrice: "30", colorIds: [pt.colors[0].id] }),
    );
    expect(result).toMatchObject({ error: expect.stringMatching(/title/i) });
  });

  it("rejects a price below $1", async () => {
    const { seller, pt, listing } = await seedListing();
    authAs(seller.id);
    const result = await updateApparelListingAction(
      listing.id, undefined, makeUpdateForm({ title: "x", retailPrice: "0.50", colorIds: [pt.colors[0].id] }),
    );
    expect(result).toMatchObject({ error: expect.stringMatching(/price/i) });
  });

  it("rejects a color that does not belong to the product type", async () => {
    const { seller, pt, listing } = await seedListing();
    const other = await seedListing();
    authAs(seller.id);
    const result = await updateApparelListingAction(
      listing.id, undefined,
      makeUpdateForm({ title: "x", retailPrice: "30", colorIds: [pt.colors[0].id, other.pt.colors[0].id] }),
    );
    expect(result).toMatchObject({ error: expect.stringMatching(/color/i) });
  });

  it("updates title, description, and price", async () => {
    const { seller, pt, listing } = await seedListing();
    authAs(seller.id);
    const result = await updateApparelListingAction(
      listing.id, undefined,
      makeUpdateForm({
        title: "New Title",
        description: "New description",
        retailPrice: "35.50",
        colorIds: [pt.colors[0].id, pt.colors[1].id],
      }),
    );
    expect(result).toEqual({ success: true });
    const after = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(after!.title).toBe("New Title");
    expect(after!.description).toBe("New description");
    expect(Number(after!.retailPrice)).toBe(35.5);
  });

  it("syncs offered colors — removing one and adding another", async () => {
    const { seller, pt, listing } = await seedListing();
    authAs(seller.id);
    // Originally offers colors[0] and colors[1]; switch to colors[1] and colors[2].
    await updateApparelListingAction(
      listing.id, undefined,
      makeUpdateForm({ title: "x", retailPrice: "30", colorIds: [pt.colors[1].id, pt.colors[2].id] }),
    );
    const rows = await prisma.apparelListingColor.findMany({ where: { apparelListingId: listing.id } });
    const offeredIds = rows.filter((r) => r.isOffered).map((r) => r.productTypeColorId).sort();
    expect(offeredIds).toEqual([pt.colors[1].id, pt.colors[2].id].sort());
  });
});

// ─── getApparelListingForEdit ─────────────────────────────────────────────────

describe("US-MFTF-5.4 — getApparelListingForEdit", () => {
  afterEach(async () => { await resetDatabase(); });

  it("returns null for a non-existent listing", async () => {
    expect(await getApparelListingForEdit("nope")).toBeNull();
  });

  it("returns the listing pre-populated with all editable data", async () => {
    const { pt, listing } = await seedListing();
    const data = await getApparelListingForEdit(listing.id);
    expect(data).not.toBeNull();
    expect(data!.title).toBe("Original Title");
    expect(data!.designImageUrl).toBe("https://blob.vercel.com/apparel/design/orig.png");
    expect(data!.productType.name).toBe(pt.name);
    // All of the product type's colors are available, each flagged offered or not.
    expect(data!.colors).toHaveLength(3);
    const offered = data!.colors.filter((c) => c.isOffered).map((c) => c.productTypeColorId).sort();
    expect(offered).toEqual([pt.colors[0].id, pt.colors[1].id].sort());
    // Lifestyle photos are returned in order.
    expect(data!.images).toHaveLength(2);
    expect(data!.images[0].isPrimary).toBe(true);
  });
});

// ─── image + design management actions ────────────────────────────────────────

describe("US-MFTF-5.4 — apparel image management", () => {
  beforeEach(async () => { await resetDatabase(); });
  afterEach(async () => { await resetDatabase(); vi.restoreAllMocks(); });

  it("addApparelImageAction appends a lifestyle photo and returns its id", async () => {
    const { seller, listing } = await seedListing();
    authAs(seller.id);
    const result = await addApparelImageAction(listing.id, "https://blob.vercel.com/apparel/ls/c.jpg");
    expect(result).toMatchObject({ success: true, imageId: expect.any(String) });
    const images = await prisma.apparelListingImage.findMany({
      where: { apparelListingId: listing.id }, orderBy: { sortOrder: "asc" },
    });
    expect(images).toHaveLength(3);
    expect(images[2].originalUrl).toBe("https://blob.vercel.com/apparel/ls/c.jpg");
    expect(images[2].sortOrder).toBe(2);
  });

  it("addApparelImageAction rejects a non-owner", async () => {
    const { listing } = await seedListing();
    authAs("intruder");
    const result = await addApparelImageAction(listing.id, "https://blob.vercel.com/x.jpg");
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(await prisma.apparelListingImage.count({ where: { apparelListingId: listing.id } })).toBe(2);
  });

  it("deleteApparelImageAction removes a lifestyle photo", async () => {
    const { seller, listing } = await seedListing();
    authAs(seller.id);
    const img = await prisma.apparelListingImage.findFirst({
      where: { apparelListingId: listing.id, isPrimary: false },
    });
    const result = await deleteApparelImageAction(listing.id, img!.id);
    expect(result).toMatchObject({ success: true });
    expect(await prisma.apparelListingImage.count({ where: { apparelListingId: listing.id } })).toBe(1);
  });

  it("deleteApparelImageAction reassigns primary when the primary is removed", async () => {
    const { seller, listing } = await seedListing();
    authAs(seller.id);
    const primary = await prisma.apparelListingImage.findFirst({
      where: { apparelListingId: listing.id, isPrimary: true },
    });
    await deleteApparelImageAction(listing.id, primary!.id);
    const remaining = await prisma.apparelListingImage.findMany({ where: { apparelListingId: listing.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isPrimary).toBe(true);
  });

  it("setApparelPrimaryImageAction makes exactly one image primary", async () => {
    const { seller, listing } = await seedListing();
    authAs(seller.id);
    const target = await prisma.apparelListingImage.findFirst({
      where: { apparelListingId: listing.id, isPrimary: false },
    });
    await setApparelPrimaryImageAction(listing.id, target!.id);
    const images = await prisma.apparelListingImage.findMany({ where: { apparelListingId: listing.id } });
    expect(images.filter((i) => i.isPrimary)).toHaveLength(1);
    expect(images.find((i) => i.isPrimary)!.id).toBe(target!.id);
  });

  it("replaceApparelDesignAction swaps the design file without touching lifestyle photos", async () => {
    const { seller, listing } = await seedListing();
    authAs(seller.id);
    const before = await prisma.apparelListingImage.count({ where: { apparelListingId: listing.id } });
    const result = await replaceApparelDesignAction(listing.id, "https://blob.vercel.com/apparel/design/new.png");
    expect(result).toMatchObject({ success: true });
    const after = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
    expect(after!.designImageUrl).toBe("https://blob.vercel.com/apparel/design/new.png");
    expect(await prisma.apparelListingImage.count({ where: { apparelListingId: listing.id } })).toBe(before);
  });

  it("replaceApparelDesignAction rejects a non-owner", async () => {
    const { listing } = await seedListing();
    authAs("intruder");
    const result = await replaceApparelDesignAction(listing.id, "https://blob.vercel.com/x.png");
    expect(result).toMatchObject({ error: expect.any(String) });
  });
});
