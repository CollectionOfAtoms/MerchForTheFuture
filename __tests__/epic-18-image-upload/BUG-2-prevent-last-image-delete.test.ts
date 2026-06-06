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
vi.mock("@vercel/blob", () => ({
  del: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockImplementation(async (path: string) => ({
    url: `https://blob.vercel.com/${path}`,
  })),
}));

const { deleteImageAction } = await import("@/app/actions/images");
const { auth } = await import("@/auth");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedListing() {
  const seller = await prisma.user.create({
    data: { email: "seller@del-test.com", name: "Del Test", roles: ["SELLER"] },
  });
  const artwork = await prisma.artwork.create({
    data: {
      sellerId: seller.id,
      title: "Del Test Artwork",
      artist: "Del Test",
      description: "For delete tests",
      status: "PUBLISHED",
    },
  });
  const listing = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100 },
  });
  return { seller, artwork, listing };
}

async function addImage(artworkId: string, order = 0, isPrimary = true) {
  return prisma.artworkImage.create({
    data: {
      artworkId,
      url: `https://blob.vercel.com/artworks/image-${order}.jpg`,
      isPrimary,
      order,
    },
  });
}

function makeSellerSession(userId: string) {
  return { user: { id: userId, roles: ["SELLER"] } };
}

// ─── BUG-2 — Cannot delete the last image from a listing ─────────────────────

describe("BUG-2 — deleteImageAction refuses to delete the last image", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  it("returns an error when attempting to delete the only image on a listing", async () => {
    const { seller, artwork, listing } = await seedListing();
    const image = await addImage(artwork.id);
    vi.mocked(auth).mockResolvedValue(makeSellerSession(seller.id) as never);

    const result = await deleteImageAction(listing.id, image.id);

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/last/i);
  });

  it("does not remove the image record when it is the last one", async () => {
    const { seller, artwork, listing } = await seedListing();
    const image = await addImage(artwork.id);
    vi.mocked(auth).mockResolvedValue(makeSellerSession(seller.id) as never);

    await deleteImageAction(listing.id, image.id);

    const still = await prisma.artworkImage.findUnique({ where: { id: image.id } });
    expect(still).not.toBeNull();
  });

  it("succeeds when there are two images and one is deleted", async () => {
    const { seller, artwork, listing } = await seedListing();
    await addImage(artwork.id, 0, true);
    const second = await addImage(artwork.id, 1, false);
    vi.mocked(auth).mockResolvedValue(makeSellerSession(seller.id) as never);

    const result = await deleteImageAction(listing.id, second.id);

    expect(result).toEqual({ success: true });
    const deleted = await prisma.artworkImage.findUnique({ where: { id: second.id } });
    expect(deleted).toBeNull();
  });
});
