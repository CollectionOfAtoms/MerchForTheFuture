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

// Mock sharp — returns a chainable mock instance
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
const mockSharp = vi.fn(() => mockSharpInst);
vi.mock("sharp", () => ({ default: mockSharp }));

// Mock @vercel/blob put — returns deterministic URLs based on path
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockImplementation(async (path: string) => ({
    url: `https://blob.vercel.com/${path}`,
  })),
  del: vi.fn().mockResolvedValue(undefined),
}));

const { generateVariants } = await import("@/lib/artworks/variants");
const { POST } = await import("@/app/api/images/process/route");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedArtworkImage({
  artistName = "Test Artist",
  imageUrl = "https://blob.vercel.com/artworks/original.jpg",
} = {}) {
  const user = await prisma.user.create({
    data: { email: "seller@test.com", name: artistName, roles: ["SELLER"] },
  });
  const artwork = await prisma.artwork.create({
    data: {
      sellerId: user.id,
      title: "Test Artwork",
      artist: artistName,
      description: "Test description",
      status: "PUBLISHED",
    },
  });
  const listing = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100 },
  });
  const image = await prisma.artworkImage.create({
    data: { artworkId: artwork.id, url: imageUrl, isPrimary: true, order: 0 },
  });
  return { user, artwork, listing, image };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/images/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── US-18.2 — Automatic Image Variant Generation ─────────────────────────────

describe("US-18.2 — Automatic Image Variant Generation", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Reset sharp mock
    mockSharpInst.rotate.mockClear().mockReturnThis();
    mockSharpInst.resize.mockClear().mockReturnThis();
    mockSharpInst.jpeg.mockClear().mockReturnThis();
    mockSharpInst.composite.mockClear().mockReturnThis();
    mockSharpInst.toColorspace.mockClear().mockReturnThis();
    mockSharpInst.flatten.mockClear().mockReturnThis();
    mockSharpInst.toBuffer.mockClear().mockResolvedValue(Buffer.from("fake-image-bytes"));
    mockSharp.mockClear();

    // Mock global fetch for downloading the original image
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

  // ── generateVariants ───────────────────────────────────────────────────────

  describe("generateVariants(imageId)", () => {
    it("returns null for a non-existent imageId", async () => {
      const result = await generateVariants("nonexistent-id");
      expect(result).toBeNull();
    });

    it("downloads the original image from its URL", async () => {
      const { image } = await seedArtworkImage({
        imageUrl: "https://blob.vercel.com/artworks/test.jpg",
      });
      await generateVariants(image.id);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://blob.vercel.com/artworks/test.jpg",
        expect.any(Object),
      );
    });

    it("creates a sharp instance from the downloaded buffer", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      // normalise + display (resize) + display (metadata read) + display (composite+encode) + grid + thumbnail
      expect(mockSharp).toHaveBeenCalledTimes(6);
    });

    it("resizes display variant to max 2400px (inside fit, no enlargement)", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      const firstResizeCall = mockSharpInst.resize.mock.calls[0];
      expect(firstResizeCall[0]).toMatchObject({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      });
    });

    it("applies watermark composite to the display variant", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      expect(mockSharpInst.composite).toHaveBeenCalledOnce();
      const compositeArg = mockSharpInst.composite.mock.calls[0][0];
      expect(Array.isArray(compositeArg)).toBe(true);
      expect(compositeArg[0]).toHaveProperty("input");
      // Watermark SVG should contain the brand name
      const svgInput = compositeArg[0].input as Buffer;
      expect(svgInput.toString()).toContain("Art &amp; Sol");
    });

    it("uses JPEG quality 85 for display variant", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      expect(mockSharpInst.jpeg.mock.calls[0][0]).toEqual({ quality: 85 });
    });

    it("resizes grid variant to max 800px (inside fit, no enlargement)", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      const secondResizeCall = mockSharpInst.resize.mock.calls[1];
      expect(secondResizeCall[0]).toMatchObject({
        width: 800,
        height: 800,
        fit: "inside",
        withoutEnlargement: true,
      });
    });

    it("uses JPEG quality 75 for grid variant", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      expect(mockSharpInst.jpeg.mock.calls[1][0]).toEqual({ quality: 75 });
    });

    it("resizes thumbnail to 400×400 with cover crop", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      const thirdResizeCall = mockSharpInst.resize.mock.calls[2];
      expect(thirdResizeCall[0]).toBe(400);
      expect(thirdResizeCall[1]).toBe(400);
      expect(thirdResizeCall[2]).toMatchObject({ fit: "cover" });
    });

    it("uses JPEG quality 70 for thumbnail variant", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      expect(mockSharpInst.jpeg.mock.calls[2][0]).toEqual({ quality: 70 });
    });

    it("uploads all three variants to Vercel Blob", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      const { put } = await import("@vercel/blob");
      expect(put).toHaveBeenCalledTimes(3);
    });

    it("uploads display variant with path containing imageId and 'display'", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      const { put } = await import("@vercel/blob");
      const paths = vi.mocked(put).mock.calls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes(image.id) && p.includes("display"))).toBe(true);
    });

    it("uploads grid variant with path containing imageId and 'grid'", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      const { put } = await import("@vercel/blob");
      const paths = vi.mocked(put).mock.calls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes(image.id) && p.includes("grid"))).toBe(true);
    });

    it("uploads thumbnail variant with path containing imageId and 'thumbnail'", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      const { put } = await import("@vercel/blob");
      const paths = vi.mocked(put).mock.calls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes(image.id) && p.includes("thumbnail"))).toBe(true);
    });

    it("updates the ArtworkImage record in the DB with all three variant URLs", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      const updated = await prisma.artworkImage.findUnique({ where: { id: image.id } });
      expect(updated?.displayUrl).toBeTruthy();
      expect(updated?.gridUrl).toBeTruthy();
      expect(updated?.thumbnailUrl).toBeTruthy();
    });

    it("returns the three variant URLs", async () => {
      const { image } = await seedArtworkImage();
      const result = await generateVariants(image.id);
      expect(result).not.toBeNull();
      expect(result?.displayUrl).toBeTruthy();
      expect(result?.gridUrl).toBeTruthy();
      expect(result?.thumbnailUrl).toBeTruthy();
    });

    it("returns null and does not update DB if sharp throws", async () => {
      const { image } = await seedArtworkImage();
      mockSharpInst.toBuffer.mockRejectedValueOnce(new Error("sharp error"));
      const result = await generateVariants(image.id);
      expect(result).toBeNull();
      const unchanged = await prisma.artworkImage.findUnique({ where: { id: image.id } });
      expect(unchanged?.displayUrl).toBeNull();
    });

    it("returns null and does not update DB if blob upload throws", async () => {
      const { image } = await seedArtworkImage();
      const { put } = await import("@vercel/blob");
      vi.mocked(put).mockRejectedValueOnce(new Error("blob error"));
      const result = await generateVariants(image.id);
      expect(result).toBeNull();
      const unchanged = await prisma.artworkImage.findUnique({ where: { id: image.id } });
      expect(unchanged?.displayUrl).toBeNull();
    });

    it("calls .rotate() before .toColorspace() to auto-correct EXIF orientation", async () => {
      const { image } = await seedArtworkImage();
      await generateVariants(image.id);
      expect(mockSharpInst.rotate).toHaveBeenCalledOnce();
      const rotateOrder = mockSharpInst.rotate.mock.invocationCallOrder[0];
      const colorspaceOrder = mockSharpInst.toColorspace.mock.invocationCallOrder[0];
      expect(rotateOrder).toBeLessThan(colorspaceOrder);
    });

    it("uses fallback watermark text when artwork has no artist name", async () => {
      const user = await prisma.user.create({
        data: { email: "noartist@test.com", name: "No Artist", roles: ["SELLER"] },
      });
      const artwork = await prisma.artwork.create({
        data: {
          sellerId: user.id,
          title: "Untitled",
          artist: null,
          description: "No artist",
          status: "PUBLISHED",
        },
      });
      const image = await prisma.artworkImage.create({
        data: { artworkId: artwork.id, url: "https://blob.example.com/art.jpg", isPrimary: true, order: 0 },
      });
      await generateVariants(image.id);
      const compositeArg = mockSharpInst.composite.mock.calls[0][0];
      const svgInput = compositeArg[0].input as Buffer;
      expect(svgInput.toString()).toBeTruthy(); // Some fallback text applied
    });
  });

  // ── /api/images/process route ──────────────────────────────────────────────

  describe("POST /api/images/process", () => {
    it("returns 400 if imageId is missing from body", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it("returns 200 with ok:false if imageId does not exist", async () => {
      const res = await POST(makeRequest({ imageId: "nonexistent" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it("returns 200 with ok:true and variant URLs on success", async () => {
      const { image } = await seedArtworkImage();
      const res = await POST(makeRequest({ imageId: image.id }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.displayUrl).toBeTruthy();
      expect(body.gridUrl).toBeTruthy();
      expect(body.thumbnailUrl).toBeTruthy();
    });

    it("returns 200 with ok:false (not 500) if processing fails", async () => {
      const { image } = await seedArtworkImage();
      mockSharpInst.toBuffer.mockRejectedValueOnce(new Error("processing failed"));
      const res = await POST(makeRequest({ imageId: image.id }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });
  });
});
