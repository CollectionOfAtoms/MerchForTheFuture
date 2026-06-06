import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: vi.fn() }));

const { createListingAction } = await import("@/app/actions/listings");
const { auth } = await import("@/auth");

function makeFormData(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((val) => fd.append(k, val));
    else fd.set(k, v);
  }
  return fd;
}

const BASE_FIELDS = {
  title: "Sunset Study",
  artist: "Jane Doe",
  description: "A beautiful painting",
  medium: "Oil on canvas",
  dimensionW: "16",
  dimensionH: "20",
  dimensionUnit: "in",
  imageUrl: "https://example.com/img.jpg",
};

describe("US-9.3 — Create New Listing", () => {
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller93@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER", "BUYER"] },
    });
    sellerId = seller.id;
    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  // ── Validation ───────────────────────────────────────────────────────────────

  it("rejects missing title", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, title: "", saleType: "FIXED_PRICE", price: "500" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Title is required." });
  });

  it("rejects missing artist", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, artist: "", saleType: "FIXED_PRICE", price: "500" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Artist is required." });
  });

  it("rejects missing description", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, description: "", saleType: "FIXED_PRICE", price: "500" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Description is required." });
  });

  it("rejects missing medium", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, medium: "", saleType: "FIXED_PRICE", price: "500" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Medium is required." });
  });

  it("rejects non-positive width", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, dimensionW: "0", saleType: "FIXED_PRICE", price: "500" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Width must be a positive number." });
  });

  it("rejects non-positive height", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, dimensionH: "-5", saleType: "FIXED_PRICE", price: "500" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Height must be a positive number." });
  });

  it("rejects invalid dimension unit", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, dimensionUnit: "ft", saleType: "FIXED_PRICE", price: "500" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Invalid dimension unit." });
  });

  it("rejects missing image", async () => {
    const { imageUrl: _omit, ...withoutImage } = BASE_FIELDS;
    const fd = makeFormData({ ...withoutImage, saleType: "FIXED_PRICE", price: "500" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "At least one photo is required." });
  });

  it("rejects fixed-price listing with zero price", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, saleType: "FIXED_PRICE", price: "0" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Price must be greater than zero." });
  });

  it("rejects auction with start bid of zero", async () => {
    const futureDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const fd = makeFormData({ ...BASE_FIELDS, saleType: "AUCTION", startBid: "0", endAt: futureDate });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Start bid must be greater than zero." });
  });

  it("rejects auction end date less than 24 hours from now", async () => {
    const soonDate = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour
    const fd = makeFormData({ ...BASE_FIELDS, saleType: "AUCTION", startBid: "100", endAt: soonDate });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Auction must end at least 24 hours from now." });
  });

  // ── Success paths ────────────────────────────────────────────────────────────

  it("creates fixed-price listing and redirects to edit page", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, saleType: "FIXED_PRICE", price: "500" });
    await expect(createListingAction(undefined, fd)).rejects.toThrow(/NEXT_REDIRECT:\/seller\/listings\/.+\/edit/);

    const listing = await prisma.originalListing.findFirst({
      where: { artwork: { sellerId } },
      include: { artwork: true },
    });
    expect(listing).not.toBeNull();
    expect(listing!.saleType).toBe("FIXED_PRICE");
    expect(Number(listing!.price)).toBe(500);
    expect(listing!.artwork.title).toBe("Sunset Study");
    expect(listing!.artwork.status).toBe("PUBLISHED");
  });

  it("creates auction listing with start bid and endAt and redirects", async () => {
    const futureDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const fd = makeFormData({ ...BASE_FIELDS, saleType: "AUCTION", startBid: "200", endAt: futureDate });
    await expect(createListingAction(undefined, fd)).rejects.toThrow(/NEXT_REDIRECT/);

    const listing = await prisma.originalListing.findFirst({
      where: { artwork: { sellerId } },
      include: { auction: true },
    });
    expect(listing!.saleType).toBe("AUCTION");
    expect(listing!.auction).not.toBeNull();
    expect(Number(listing!.auction!.startBid)).toBe(200);
  });

  it("saves at least one image linked to the new artwork", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, saleType: "FIXED_PRICE", price: "500" });
    await expect(createListingAction(undefined, fd)).rejects.toThrow(/NEXT_REDIRECT/);

    const artwork = await prisma.artwork.findFirst({ where: { sellerId }, include: { images: true } });
    expect(artwork!.images).toHaveLength(1);
    expect(artwork!.images[0].isPrimary).toBe(true);
  });

  it("stores dimensions in width×height unit format", async () => {
    const fd = makeFormData({ ...BASE_FIELDS, dimensionW: "24", dimensionH: "36", dimensionUnit: "cm", saleType: "FIXED_PRICE", price: "500" });
    await expect(createListingAction(undefined, fd)).rejects.toThrow(/NEXT_REDIRECT/);

    const artwork = await prisma.artwork.findFirst({ where: { sellerId } });
    expect(artwork!.dimensions).toBe("24×36 cm");
  });
});
