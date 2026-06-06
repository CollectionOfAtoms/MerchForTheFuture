import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { auth } = await import("@/auth");
const { createListingAction, updateListingAction } = await import("@/app/actions/listings");

describe("US-15.5 — Structured Artwork Dimensions", () => {
  let sellerId: string;
  let listingId: string;

  beforeEach(async () => {
    await resetDatabase();
    vi.resetAllMocks();

    const seller = await prisma.user.create({
      data: { email: "seller155@test.com", name: "Dim Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;

    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);

    // Seed a listing for update tests
    const artwork = await prisma.artwork.create({
      data: {
        sellerId,
        title: "Test Artwork",
        description: "Desc",
        artist: "Artist",
        medium: "Oil",
        dimensions: "16×20 in",
        status: "PUBLISHED",
        images: { create: [{ url: "https://cdn.example.com/img.jpg", isPrimary: true, order: 0 }] },
      },
    });
    const listing = await prisma.originalListing.create({
      data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 500, currency: "USD", status: "ACTIVE" },
    });
    listingId = listing.id;
  });

  function makeCreateForm(overrides: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("title", "Test Piece");
    fd.set("artist", "Jane Doe");
    fd.set("description", "A beautiful piece");
    fd.set("medium", "Oil on canvas");
    fd.set("saleType", "FIXED_PRICE");
    fd.set("price", "500");
    fd.set("dimensionW", "16");
    fd.set("dimensionH", "20");
    fd.set("dimensionUnit", "in");
    fd.append("imageUrl", "https://cdn.example.com/art.jpg");
    for (const [key, value] of Object.entries(overrides)) {
      fd.set(key, value);
    }
    return fd;
  }

  function makeUpdateForm(overrides: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("title", "Updated Title");
    fd.set("description", "Updated description");
    fd.set("artist", "Jane Doe");
    fd.set("medium", "Oil");
    fd.set("price", "600");
    fd.set("dimensionW", "24");
    fd.set("dimensionH", "36");
    fd.set("dimensionUnit", "cm");
    for (const [key, value] of Object.entries(overrides)) {
      fd.set(key, value);
    }
    return fd;
  }

  it("createListingAction stores dimensions in canonical format '16×20 in'", async () => {
    const fd = makeCreateForm({ dimensionW: "16", dimensionH: "20", dimensionUnit: "in" });
    let redirected = false;
    try {
      await createListingAction(undefined, fd);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT:")) redirected = true;
      else throw e;
    }
    expect(redirected).toBe(true);

    const artwork = await prisma.artwork.findFirst({ where: { sellerId }, orderBy: { createdAt: "desc" } });
    expect(artwork?.dimensions).toBe("16×20 in");
  });

  it("createListingAction returns error when dimensionW is 0", async () => {
    const fd = makeCreateForm({ dimensionW: "0" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Width must be a positive number." });
  });

  it("createListingAction returns error when dimensionW is negative", async () => {
    const fd = makeCreateForm({ dimensionW: "-5" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Width must be a positive number." });
  });

  it("createListingAction returns error when dimensionH is 0", async () => {
    const fd = makeCreateForm({ dimensionH: "0" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Height must be a positive number." });
  });

  it("createListingAction returns error when dimensionW is non-numeric", async () => {
    const fd = makeCreateForm({ dimensionW: "abc" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Width must be a positive number." });
  });

  it("createListingAction returns error when dimensionUnit is invalid (e.g., 'ft')", async () => {
    const fd = makeCreateForm({ dimensionUnit: "ft" });
    const result = await createListingAction(undefined, fd);
    expect(result).toEqual({ error: "Invalid dimension unit." });
  });

  it("updateListingAction stores dimensions in canonical format '24×36 cm'", async () => {
    const fd = makeUpdateForm({ dimensionW: "24", dimensionH: "36", dimensionUnit: "cm" });
    const result = await updateListingAction(listingId, undefined, fd);
    expect(result).toEqual({ success: true });

    const listing = await prisma.originalListing.findUnique({
      where: { id: listingId },
      include: { artwork: true },
    });
    expect(listing?.artwork.dimensions).toBe("24×36 cm");
  });

  it("updateListingAction saves null dimensions when dimension fields are empty", async () => {
    const fd = makeUpdateForm({ dimensionW: "", dimensionH: "", dimensionUnit: "" });
    const result = await updateListingAction(listingId, undefined, fd);
    expect(result).toEqual({ success: true });

    const listing = await prisma.originalListing.findUnique({
      where: { id: listingId },
      include: { artwork: true },
    });
    expect(listing?.artwork.dimensions).toBeNull();
  });
});
