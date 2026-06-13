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

// Mock sharp — returns a chainable mock instance (mirrors US-18.2 harness).
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

const { generateVariants, generateApparelImageVariants } = await import(
  "@/lib/artworks/variants"
);
const { POST } = await import("@/app/api/apparel/images/process/route");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedApparelListing({
  designImageUrl = null as string | null,
  originalUrl = "https://blob.vercel.com/apparel/lifestyle/original.jpg",
} = {}) {
  const seller = await prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "Seller", roles: ["SELLER"] },
  });
  const productType = await prisma.productType.create({
    data: { name: `Tee ${crypto.randomUUID()}`, fulfillmentProvider: "TEEMILL", providerSkuBase: "RNA1" },
  });
  const listing = await prisma.apparelListing.create({
    data: {
      sellerId: seller.id,
      productTypeId: productType.id,
      title: "Solar Punk Bee",
      description: "A hopeful tee",
      retailPrice: 28,
      status: "ACTIVE",
      designImageUrl,
    },
  });
  const image = await prisma.apparelListingImage.create({
    data: { apparelListingId: listing.id, originalUrl, isPrimary: true, sortOrder: 0 },
  });
  return { seller, productType, listing, image };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/apparel/images/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function compositeSvgString(): string {
  const arg = mockSharpInst.composite.mock.calls[0][0] as { input: Buffer }[];
  return (arg[0].input as Buffer).toString();
}

// ─── US-MFTF-5.2 — Lifestyle Photo Upload with Corner Watermark ───────────────

describe("US-MFTF-5.2 — Lifestyle Photo Upload with Corner Watermark", () => {
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
    mockSharpInst.metadata.mockClear().mockResolvedValue({ width: 800, height: 600 });
    mockSharp.mockClear();

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

  // ── watermarkStyle parameter on generateVariants ───────────────────────────

  describe("generateVariants(imageId, watermarkStyle)", () => {
    async function seedArtworkImage() {
      const user = await prisma.user.create({
        data: { email: `a-${crypto.randomUUID()}@test.com`, name: "Artist", roles: ["SELLER"] },
      });
      const artwork = await prisma.artwork.create({
        data: { sellerId: user.id, title: "Art", artist: "Artist", description: "d", status: "PUBLISHED" },
      });
      await prisma.originalListing.create({
        data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: 100 },
      });
      return prisma.artworkImage.create({
        data: { artworkId: artwork.id, url: "https://blob.vercel.com/artworks/o.jpg", isPrimary: true, order: 0 },
      });
    }

    it("defaults to the diagonal watermark when no style is given", async () => {
      const image = await seedArtworkImage();
      await generateVariants(image.id);
      expect(mockSharpInst.composite).toHaveBeenCalledOnce();
      const svg = compositeSvgString();
      expect(svg).toContain("Merch for the Future");
      expect(svg).toContain("rotate(-30"); // diagonal hallmark
    });

    it("applies a corner watermark when watermarkStyle is 'corner'", async () => {
      const image = await seedArtworkImage();
      await generateVariants(image.id, "corner");
      expect(mockSharpInst.composite).toHaveBeenCalledOnce();
      const svg = compositeSvgString();
      expect(svg).toContain('text-anchor="end"'); // anchored to the right edge
      expect(svg).not.toContain("rotate("); // not the diagonal overlay
    });
  });

  // ── generateApparelImageVariants ───────────────────────────────────────────

  describe("generateApparelImageVariants(apparelImageId)", () => {
    it("returns null for a non-existent apparel image id", async () => {
      const result = await generateApparelImageVariants("nonexistent-id");
      expect(result).toBeNull();
    });

    it("downloads the original lifestyle photo from its URL", async () => {
      const { image } = await seedApparelListing({
        originalUrl: "https://blob.vercel.com/apparel/lifestyle/test.jpg",
      });
      await generateApparelImageVariants(image.id);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://blob.vercel.com/apparel/lifestyle/test.jpg",
        expect.any(Object),
      );
    });

    it("updates the ApparelListingImage record with all three variant URLs", async () => {
      const { image } = await seedApparelListing();
      await generateApparelImageVariants(image.id);
      const updated = await prisma.apparelListingImage.findUnique({ where: { id: image.id } });
      expect(updated?.displayUrl).toBeTruthy();
      expect(updated?.gridUrl).toBeTruthy();
      expect(updated?.thumbnailUrl).toBeTruthy();
    });

    it("returns the three variant URLs", async () => {
      const { image } = await seedApparelListing();
      const result = await generateApparelImageVariants(image.id);
      expect(result?.displayUrl).toBeTruthy();
      expect(result?.gridUrl).toBeTruthy();
      expect(result?.thumbnailUrl).toBeTruthy();
    });

    it("watermarks only the display variant (composite called exactly once)", async () => {
      const { image } = await seedApparelListing();
      await generateApparelImageVariants(image.id);
      expect(mockSharpInst.composite).toHaveBeenCalledOnce();
    });

    it("uses the corner watermark style for the display variant", async () => {
      const { image } = await seedApparelListing();
      await generateApparelImageVariants(image.id);
      const svg = compositeSvgString();
      expect(svg).toContain('text-anchor="end"'); // bottom-right corner anchor
      expect(svg).toContain("0.7"); // ~70% opacity
      expect(svg).not.toContain("rotate("); // not diagonal
    });

    it("sizes the corner mark to ~8% of the image width", async () => {
      const { image } = await seedApparelListing();
      await generateApparelImageVariants(image.id);
      const svg = compositeSvgString();
      // mock metadata width is 800 → 8% = 64
      expect(svg).toContain('font-size="64"');
    });

    it("uploads variants to an apparel-scoped blob path containing the image id", async () => {
      const { image } = await seedApparelListing();
      await generateApparelImageVariants(image.id);
      const { put } = await import("@vercel/blob");
      const paths = vi.mocked(put).mock.calls.map((c) => c[0] as string);
      expect(paths.length).toBe(3);
      expect(paths.every((p) => p.includes("apparel"))).toBe(true);
      expect(paths.some((p) => p.includes(image.id) && p.includes("display"))).toBe(true);
      expect(paths.some((p) => p.includes(image.id) && p.includes("grid"))).toBe(true);
      expect(paths.some((p) => p.includes(image.id) && p.includes("thumbnail"))).toBe(true);
    });

    it("returns null and does not update the DB if processing fails", async () => {
      const { image } = await seedApparelListing();
      mockSharpInst.toBuffer.mockRejectedValueOnce(new Error("sharp error"));
      const result = await generateApparelImageVariants(image.id);
      expect(result).toBeNull();
      const unchanged = await prisma.apparelListingImage.findUnique({ where: { id: image.id } });
      expect(unchanged?.displayUrl).toBeNull();
    });

    it("leaves the clean design file untouched — design files bypass the variant pipeline", async () => {
      const designUrl = "https://blob.vercel.com/apparel/design/clean-design.png";
      const { image, listing } = await seedApparelListing({ designImageUrl: designUrl });
      await generateApparelImageVariants(image.id);
      // Design file URL is never fetched or re-processed
      expect(global.fetch).not.toHaveBeenCalledWith(designUrl, expect.anything());
      const after = await prisma.apparelListing.findUnique({ where: { id: listing.id } });
      expect(after?.designImageUrl).toBe(designUrl); // stored verbatim, no watermark
    });
  });

  // ── POST /api/apparel/images/process ───────────────────────────────────────

  describe("POST /api/apparel/images/process", () => {
    it("returns 400 if apparelImageId is missing from body", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it("returns 200 with ok:false if the apparel image does not exist", async () => {
      const res = await POST(makeRequest({ apparelImageId: "nonexistent" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it("returns 200 with ok:true and variant URLs on success", async () => {
      const { image } = await seedApparelListing();
      const res = await POST(makeRequest({ apparelImageId: image.id }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.displayUrl).toBeTruthy();
      expect(body.gridUrl).toBeTruthy();
      expect(body.thumbnailUrl).toBeTruthy();
    });
  });
});
