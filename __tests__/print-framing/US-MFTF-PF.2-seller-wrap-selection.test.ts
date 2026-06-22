import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { setCanvasWrapAction } = await import("@/app/actions/listings");
const { getFramingForArtwork } = await import("@/lib/print/framing");
const { auth } = await import("@/auth");

const CANVAS_PRODUCTS = [
  { sku: "GLOBAL-CAN-8X10", size: "8×10 in", price: 90 },
  { sku: "GLOBAL-CAN-16X20", size: "16×20 in", price: 160 },
  { sku: "GLOBAL-FAP-12X18", size: "12×18 in", price: 60 }, // paper, 2:3
];

describe("US-MFTF-PF.2 — Seller Wrap Selection (action)", () => {
  let sellerId: string;
  let artworkId: string;
  let listingId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "S", passwordHash: "x", roles: ["SELLER"] },
    });
    sellerId = seller.id;
    const artwork = await prisma.artwork.create({
      data: {
        title: "Art",
        description: "d",
        sellerId,
        status: "PUBLISHED",
        images: { create: [{ url: "https://example.com/p.jpg", isPrimary: true, order: 0 }] },
      },
    });
    artworkId = artwork.id;
    const listing = await prisma.originalListing.create({
      data: {
        artworkId,
        saleType: "FIXED_PRICE",
        price: 500,
        currency: "USD",
        status: "ACTIVE",
        availableForPrint: true,
        printSourceImageUrl: "https://cdn.example.com/hires.jpg",
        printProducts: CANVAS_PRODUCTS as never,
      },
    });
    listingId = listing.id;
    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("persists an allowed wrap to PrintFraming.wrap for the canvas aspect", async () => {
    const result = await setCanvasWrapAction(listingId, "4:5", "BLACK");
    expect(result).toEqual({ success: true });
    const framings = await getFramingForArtwork(artworkId);
    const row = framings.find((f) => f.aspectRatio === "4:5");
    expect(row?.wrap).toBe("BLACK");
  });

  it("defaults nothing (no row) until the seller acts, then upserts independently of the crop", async () => {
    // pre-seed a crop with no wrap, then set wrap — crop must survive
    await prisma.printFraming.create({
      data: { artworkId, aspectRatio: "4:5", croppedUrl: "https://blob/45.jpg" },
    });
    await setCanvasWrapAction(listingId, "4:5", "MIRROR_WRAP");
    const framings = await getFramingForArtwork(artworkId);
    const row = framings.find((f) => f.aspectRatio === "4:5");
    expect(row?.wrap).toBe("MIRROR_WRAP");
    expect(row?.croppedUrl).toBe("https://blob/45.jpg"); // crop preserved
  });

  it("rejects ImageWrap server-side even though the enum contains it", async () => {
    const result = await setCanvasWrapAction(listingId, "4:5", "IMAGE_WRAP");
    expect(result).toHaveProperty("error");
    const framings = await getFramingForArtwork(artworkId);
    expect(framings.find((f) => f.aspectRatio === "4:5")?.wrap ?? null).toBeNull();
  });

  it("rejects an unknown wrap value", async () => {
    const result = await setCanvasWrapAction(listingId, "4:5", "GOLD");
    expect(result).toHaveProperty("error");
  });

  it("rejects setting a wrap on a paper-only aspect", async () => {
    const result = await setCanvasWrapAction(listingId, "2:3", "BLACK");
    expect(result).toHaveProperty("error");
  });

  it("rejects an aspect the listing does not offer", async () => {
    const result = await setCanvasWrapAction(listingId, "1:1", "BLACK");
    expect(result).toHaveProperty("error");
  });

  it("rejects a non-owner", async () => {
    const other = await prisma.user.create({
      data: { email: "other@test.com", name: "O", passwordHash: "x", roles: ["SELLER"] },
    });
    vi.mocked(auth).mockResolvedValue({ user: { id: other.id, roles: ["SELLER"] } } as never);
    const result = await setCanvasWrapAction(listingId, "4:5", "BLACK");
    expect(result).toHaveProperty("error");
  });
});
