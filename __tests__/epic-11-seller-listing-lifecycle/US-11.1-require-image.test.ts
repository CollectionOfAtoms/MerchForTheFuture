import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

// Mock Next.js server internals required by the action
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

// Import after mocks are set up
const { createListingAction } = await import("@/app/actions/listings");
const { auth } = await import("@/auth");

describe("US-11.1 — Require Image on Listing Creation", () => {
  let sellerId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller11@test.com", name: "Test Seller", passwordHash: "hash", roles: ["SELLER"] },
    });
    sellerId = seller.id;
    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  it("rejects submission when no image URLs are provided", async () => {
    const formData = new FormData();
    formData.set("title", "My Artwork");
    formData.set("artist", "Test Artist");
    formData.set("description", "A description");
    formData.set("medium", "Oil on canvas");
    formData.set("dimensionW", "16");
    formData.set("dimensionH", "20");
    formData.set("dimensionUnit", "in");
    formData.set("saleType", "FIXED_PRICE");
    formData.set("price", "500");
    // no imageUrl field

    const result = await createListingAction(undefined, formData);
    expect(result).toEqual({ error: "At least one photo is required." });
  });

  it("proceeds past image validation when at least one image URL is provided", async () => {
    const formData = new FormData();
    formData.set("title", "My Artwork");
    formData.set("artist", "Test Artist");
    formData.set("description", "A description");
    formData.set("medium", "Oil on canvas");
    formData.set("dimensionW", "16");
    formData.set("dimensionH", "20");
    formData.set("dimensionUnit", "in");
    formData.set("saleType", "FIXED_PRICE");
    formData.set("price", "500");
    formData.append("imageUrl", "https://cdn.example.com/art.jpg");

    // Should redirect (throw NEXT_REDIRECT) not return an image error
    await expect(createListingAction(undefined, formData)).rejects.toThrow("NEXT_REDIRECT");

    // Confirm the artwork was created with the image
    const artwork = await prisma.artwork.findFirst({ include: { images: true } });
    expect(artwork).not.toBeNull();
    expect(artwork!.images).toHaveLength(1);
    expect(artwork!.images[0].isPrimary).toBe(true);
  });
});
