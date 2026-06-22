import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";
import {
  parseAspect,
  defaultCropRect,
  clampRect,
  withWidth,
  moveRect,
  toPixelRect,
  toNormalizedRect,
  cropPixelAspect,
  invertAspect,
  orientedAspect,
  variantForPixelAspect,
  MIN_CROP_FRACTION,
} from "@/lib/print/crop-geometry";

// ─── Mocks for the server crop path (must precede dynamic imports) ────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const mockSharpInst = {
  rotate: vi.fn().mockReturnThis(),
  toColorspace: vi.fn().mockReturnThis(),
  extract: vi.fn().mockReturnThis(),
  jpeg: vi.fn().mockReturnThis(),
  toBuffer: vi.fn().mockResolvedValue(Buffer.from("cropped-bytes")),
  metadata: vi.fn().mockResolvedValue({ width: 2000, height: 1600 }),
};
vi.mock("sharp", () => ({ default: vi.fn(() => mockSharpInst) }));
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockImplementation(async (path: string) => ({ url: `https://blob.vercel.com/${path}` })),
  del: vi.fn().mockResolvedValue(undefined),
}));

const { confirmFramingAction } = await import("@/app/actions/listings");
const { getFramingForArtwork } = await import("@/lib/print/framing");
const { auth } = await import("@/auth");

const TOL = 0.02;

describe("US-MFTF-PF.3 — crop geometry (pure)", () => {
  it("parses an aspect ratio to a pixel width/height value", () => {
    expect(parseAspect("4:5")).toBeCloseTo(0.8);
    expect(parseAspect("3:2")).toBeCloseTo(1.5);
    expect(parseAspect("1:1")).toBeCloseTo(1);
  });

  it("throws on an unparseable aspect", () => {
    expect(() => parseAspect("oops")).toThrow();
  });

  it("default crop is aspect-locked and fits inside a landscape image", () => {
    const imgW = 2000, imgH = 1000; // 2:1 landscape
    const rect = defaultCropRect("4:5", imgW, imgH);
    // within bounds
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1 + 1e-9);
    // 4:5 is portrait → image is height-limited → full height
    expect(rect.h).toBeCloseTo(1);
    expect(cropPixelAspect(rect, imgW, imgH)).toBeCloseTo(0.8, 2);
  });

  it("default crop is aspect-locked and fits inside a portrait image", () => {
    const imgW = 1000, imgH = 2000; // 1:2 portrait
    const rect = defaultCropRect("3:2", imgW, imgH); // landscape target
    expect(rect.w).toBeCloseTo(1); // width-limited
    expect(cropPixelAspect(rect, imgW, imgH)).toBeCloseTo(1.5, 2);
  });

  it("aspect-lock holds under resize (withWidth)", () => {
    const imgW = 2000, imgH = 1600;
    let rect = defaultCropRect("4:5", imgW, imgH);
    rect = withWidth(rect, 0.4, "4:5", imgW, imgH);
    expect(cropPixelAspect(rect, imgW, imgH)).toBeCloseTo(0.8, 2);
    rect = withWidth(rect, 0.9, "4:5", imgW, imgH);
    expect(cropPixelAspect(rect, imgW, imgH)).toBeCloseTo(0.8, 2);
  });

  it("clampRect pulls an out-of-bounds rect fully inside the image", () => {
    const imgW = 2000, imgH = 1600;
    const clamped = clampRect({ x: 0.8, y: 0.9, w: 0.6, h: 0.6 }, "4:5", imgW, imgH);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
    expect(clamped.x + clamped.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(clamped.y + clamped.h).toBeLessThanOrEqual(1 + 1e-9);
    expect(cropPixelAspect(clamped, imgW, imgH)).toBeCloseTo(0.8, 2);
  });

  it("clampRect enforces the minimum crop size", () => {
    const imgW = 2000, imgH = 1600;
    const clamped = clampRect({ x: 0.1, y: 0.1, w: 0.001, h: 0.001 }, "4:5", imgW, imgH);
    expect(clamped.w).toBeGreaterThanOrEqual(MIN_CROP_FRACTION - 1e-9);
  });

  it("moveRect keeps the rect inside the image bounds", () => {
    const rect = { x: 0.5, y: 0.5, w: 0.4, h: 0.4 };
    const moved = moveRect(rect, 0.5, 0.5);
    expect(moved.x + moved.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(moved.y + moved.h).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("normalized↔pixel round-trips within tolerance", () => {
    const imgW = 2000, imgH = 1600;
    const rect = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 };
    const px = toPixelRect(rect, imgW, imgH);
    const back = toNormalizedRect(px, imgW, imgH);
    expect(back.x).toBeCloseTo(rect.x, 2);
    expect(back.y).toBeCloseTo(rect.y, 2);
    expect(back.w).toBeCloseTo(rect.w, 2);
    expect(back.h).toBeCloseTo(rect.h, 2);
  });

  it("invertAspect swaps orientation (square unchanged)", () => {
    expect(invertAspect("11:17")).toBe("17:11");
    expect(invertAspect("4:5")).toBe("5:4");
    expect(parseAspect(invertAspect("1:1"))).toBeCloseTo(1);
  });

  it("orientedAspect picks the orientation matching the source image", () => {
    // Portrait SKU (11:17) over a LANDSCAPE source (17×11 px) → frame landscape.
    expect(orientedAspect("11:17", 1700, 1100)).toBe("17:11");
    // …over a PORTRAIT source → keep portrait.
    expect(orientedAspect("11:17", 1100, 1700)).toBe("11:17");
  });

  it("variantForPixelAspect locks to the orientation a stored crop was framed in", () => {
    // A landscape rect (pixel aspect ~1.5) on an 11:17 SKU → the 17:11 variant.
    expect(variantForPixelAspect("11:17", 1.55)).toBe("17:11");
    expect(variantForPixelAspect("11:17", 0.65)).toBe("11:17");
  });

  it("produced pixel crop aspect matches target within rounding tolerance", () => {
    const imgW = 1999, imgH = 1601; // awkward odd dims
    const rect = clampRect(defaultCropRect("4:5", imgW, imgH), "4:5", imgW, imgH);
    const px = toPixelRect(rect, imgW, imgH);
    expect(Math.abs(px.width / px.height - 0.8)).toBeLessThan(TOL);
  });
});

describe("US-MFTF-PF.3 — confirmFramingAction (server crop)", () => {
  let sellerId: string;
  let artworkId: string;
  let listingId: string;

  const PRODUCTS = [
    { sku: "GLOBAL-CAN-8X10", size: "8×10 in", price: 90 },
    { sku: "GLOBAL-FAP-12X18", size: "12×18 in", price: 60 },
  ];

  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSharpInst.rotate.mockClear().mockReturnThis();
    mockSharpInst.toColorspace.mockClear().mockReturnThis();
    mockSharpInst.extract.mockClear().mockReturnThis();
    mockSharpInst.jpeg.mockClear().mockReturnThis();
    mockSharpInst.toBuffer.mockClear().mockResolvedValue(Buffer.from("cropped-bytes"));
    mockSharpInst.metadata.mockClear().mockResolvedValue({ width: 2000, height: 1600 });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)) }) as never;

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
        printProducts: PRODUCTS as never,
      },
    });
    listingId = listing.id;
    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  const rect = { x: 0.1, y: 0.0, w: 0.8, h: 1.0 };

  it("crops via Sharp extract and persists croppedUrl + rect, clearing needsReframe", async () => {
    // start with a needsReframe row to prove it is cleared
    await prisma.printFraming.create({ data: { artworkId, aspectRatio: "4:5", needsReframe: true } });

    const result = await confirmFramingAction(listingId, "4:5", rect);
    expect(result).toEqual({ success: true });

    expect(mockSharpInst.extract).toHaveBeenCalledOnce();
    const extractArg = mockSharpInst.extract.mock.calls[0][0];
    expect(extractArg).toMatchObject({ left: expect.any(Number), top: expect.any(Number), width: expect.any(Number), height: expect.any(Number) });

    const framings = await getFramingForArtwork(artworkId);
    const row = framings.find((f) => f.aspectRatio === "4:5");
    expect(row?.croppedUrl).toContain("blob.vercel.com");
    expect(row?.cropW).toBeCloseTo(0.8);
    expect(row?.needsReframe).toBe(false);
  });

  it("uploads the crop to a path scoped by artwork + aspect", async () => {
    await confirmFramingAction(listingId, "4:5", rect);
    const { put } = await import("@vercel/blob");
    const path = vi.mocked(put).mock.calls[0][0] as string;
    expect(path).toContain(artworkId);
    expect(path).toContain("4x5");
  });

  it("works for a paper aspect too (framing applies to canvas AND paper)", async () => {
    const result = await confirmFramingAction(listingId, "2:3", { x: 0, y: 0.1, w: 1, h: 0.8 });
    expect(result).toEqual({ success: true });
    const framings = await getFramingForArtwork(artworkId);
    expect(framings.find((f) => f.aspectRatio === "2:3")?.croppedUrl).toBeTruthy();
  });

  it("rejects an aspect the listing does not offer", async () => {
    const result = await confirmFramingAction(listingId, "1:1", rect);
    expect(result).toHaveProperty("error");
    expect(mockSharpInst.extract).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range crop rect", async () => {
    const result = await confirmFramingAction(listingId, "4:5", { x: -0.1, y: 0, w: 1.2, h: 1 });
    expect(result).toHaveProperty("error");
  });

  it("rejects when no print source image is set", async () => {
    await prisma.originalListing.update({ where: { id: listingId }, data: { printSourceImageUrl: null } });
    const result = await confirmFramingAction(listingId, "4:5", rect);
    expect(result).toHaveProperty("error");
  });

  it("rejects a non-owner", async () => {
    const other = await prisma.user.create({
      data: { email: "o@test.com", name: "O", passwordHash: "x", roles: ["SELLER"] },
    });
    vi.mocked(auth).mockResolvedValue({ user: { id: other.id, roles: ["SELLER"] } } as never);
    const result = await confirmFramingAction(listingId, "4:5", rect);
    expect(result).toHaveProperty("error");
  });

  it("returns an error (no crash) if Sharp fails", async () => {
    mockSharpInst.toBuffer.mockRejectedValueOnce(new Error("sharp boom"));
    const result = await confirmFramingAction(listingId, "4:5", rect);
    expect(result).toHaveProperty("error");
  });
});
