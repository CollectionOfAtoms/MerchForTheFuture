import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// ─── Mocks (must precede dynamic imports) ─────────────────────────────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

const mockSharpInst = {
  rotate: vi.fn().mockReturnThis(),
  resize: vi.fn().mockReturnThis(),
  jpeg: vi.fn().mockReturnThis(),
  composite: vi.fn().mockReturnThis(),
  toColorspace: vi.fn().mockReturnThis(),
  flatten: vi.fn().mockReturnThis(),
  toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-image-bytes")),
  metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
};
vi.mock("sharp", () => ({ default: vi.fn(() => mockSharpInst) }));

vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockImplementation(async (path: string) => ({
    url: `https://blob.vercel.com/${path}`,
  })),
  del: vi.fn().mockResolvedValue(undefined),
}));

const { regenerateVariantsAction } = await import("@/app/actions/images");
const { auth } = await import("@/auth");
const { revalidatePath } = await import("next/cache");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedListingWithImage() {
  const seller = await prisma.user.create({
    data: { email: "seller@regen-test.com", name: "Regen Seller", roles: ["SELLER"] },
  });
  const artwork = await prisma.artwork.create({
    data: {
      sellerId: seller.id,
      title: "Regen Test Artwork",
      artist: "Regen Seller",
      description: "For regeneration tests",
      status: "PUBLISHED",
    },
  });
  const listing = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 500 },
  });
  const image = await prisma.artworkImage.create({
    data: {
      artworkId: artwork.id,
      url: "https://blob.vercel.com/artworks/original.jpg",
      isPrimary: true,
      order: 0,
    },
  });
  return { seller, artwork, listing, image };
}

function makeSellerSession(userId: string) {
  return { user: { id: userId, roles: ["SELLER"] } };
}

// ─── US-18.3 — Seller Can Regenerate Image Variants ──────────────────────────

describe("US-18.3 — Seller Can Regenerate Image Variants", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});

    mockSharpInst.rotate.mockClear().mockReturnThis();
    mockSharpInst.resize.mockClear().mockReturnThis();
    mockSharpInst.jpeg.mockClear().mockReturnThis();
    mockSharpInst.composite.mockClear().mockReturnThis();
    mockSharpInst.toColorspace.mockClear().mockReturnThis();
    mockSharpInst.flatten.mockClear().mockReturnThis();
    mockSharpInst.toBuffer.mockClear().mockResolvedValue(Buffer.from("fake-image-bytes"));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
    });
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns error when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const { listing, image } = await seedListingWithImage();

    const result = await regenerateVariantsAction(listing.id, image.id);
    expect(result).toHaveProperty("error");
  });

  it("returns error when user is not a seller", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "buyer-1", roles: ["BUYER"] },
    } as never);
    const { listing, image } = await seedListingWithImage();

    const result = await regenerateVariantsAction(listing.id, image.id);
    expect(result).toHaveProperty("error");
  });

  it("returns error when image belongs to a different artwork", async () => {
    const { seller, listing } = await seedListingWithImage();
    vi.mocked(auth).mockResolvedValue(makeSellerSession(seller.id) as never);

    // Create an image on a different artwork
    const otherArtwork = await prisma.artwork.create({
      data: {
        sellerId: seller.id,
        title: "Other Artwork",
        artist: "Other",
        description: "Other",
        status: "PUBLISHED",
      },
    });
    const otherImage = await prisma.artworkImage.create({
      data: {
        artworkId: otherArtwork.id,
        url: "https://blob.vercel.com/other.jpg",
        isPrimary: true,
        order: 0,
      },
    });

    const result = await regenerateVariantsAction(listing.id, otherImage.id);
    expect(result).toHaveProperty("error");
  });

  it("returns error for a nonexistent imageId", async () => {
    const { seller, listing } = await seedListingWithImage();
    vi.mocked(auth).mockResolvedValue(makeSellerSession(seller.id) as never);

    const result = await regenerateVariantsAction(listing.id, "nonexistent-image-id");
    expect(result).toHaveProperty("error");
  });

  it("regenerates variants and returns success for authenticated seller", async () => {
    const { seller, listing, image } = await seedListingWithImage();
    vi.mocked(auth).mockResolvedValue(makeSellerSession(seller.id) as never);

    const result = await regenerateVariantsAction(listing.id, image.id);
    expect(result).toEqual({ success: true });
  });

  it("updates the ArtworkImage record with new variant URLs on success", async () => {
    const { seller, listing, image } = await seedListingWithImage();
    vi.mocked(auth).mockResolvedValue(makeSellerSession(seller.id) as never);

    await regenerateVariantsAction(listing.id, image.id);

    const updated = await prisma.artworkImage.findUnique({ where: { id: image.id } });
    expect(updated?.displayUrl).toBeTruthy();
    expect(updated?.gridUrl).toBeTruthy();
    expect(updated?.thumbnailUrl).toBeTruthy();
  });

  it("calls revalidatePath with the listing edit path on success", async () => {
    const { seller, listing, image } = await seedListingWithImage();
    vi.mocked(auth).mockResolvedValue(makeSellerSession(seller.id) as never);

    await regenerateVariantsAction(listing.id, image.id);

    expect(revalidatePath).toHaveBeenCalledWith(`/seller/listings/${listing.id}/edit`);
  });

  it("succeeds for a SOLD listing (not gated on listing status)", async () => {
    const { seller, listing, image } = await seedListingWithImage();
    await prisma.originalListing.update({
      where: { id: listing.id },
      data: { status: "SOLD" },
    });
    vi.mocked(auth).mockResolvedValue(makeSellerSession(seller.id) as never);

    const result = await regenerateVariantsAction(listing.id, image.id);
    expect(result).toEqual({ success: true });
  });

  it("returns error (does not throw) when variant generation fails", async () => {
    const { seller, listing, image } = await seedListingWithImage();
    vi.mocked(auth).mockResolvedValue(makeSellerSession(seller.id) as never);
    mockSharpInst.toBuffer.mockRejectedValueOnce(new Error("sharp error"));

    const result = await regenerateVariantsAction(listing.id, image.id);
    expect(result).toHaveProperty("error");
  });
});
