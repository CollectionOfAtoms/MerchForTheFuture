import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sharp from "sharp";
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

// Capture blob put calls so we can inspect the actual image buffers written
const putBuffers: Record<string, Buffer> = {};
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockImplementation(async (path: string, buffer: Buffer) => {
    putBuffers[path] = Buffer.from(buffer);
    return { url: `https://blob.vercel.com/${path}` };
  }),
  del: vi.fn().mockResolvedValue(undefined),
}));

// Do NOT mock sharp — we need real image processing to test orientation

const { generateVariants } = await import("@/lib/artworks/variants");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a minimal JPEG buffer with the given EXIF orientation tag.
 *
 * For orientations 1 and 3 the image is stored portrait (storedW < storedH).
 * For orientations 6 and 8 phones store the pixels landscape (storedW > storedH)
 * and rely on the EXIF tag to signal the viewer to rotate.
 */
async function makeOrientedJpeg(
  logicalWidth: number,
  logicalHeight: number,
  exifOrientation: 1 | 3 | 6 | 8,
): Promise<Buffer> {
  // For 90°/270° rotations, stored dimensions are swapped.
  const needsSwap = exifOrientation === 6 || exifOrientation === 8;
  const storedW = needsSwap ? logicalHeight : logicalWidth;
  const storedH = needsSwap ? logicalWidth : logicalHeight;

  return sharp({
    create: {
      width: storedW,
      height: storedH,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .withMetadata({ orientation: exifOrientation })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function seedImage(imageUrl = "https://blob.vercel.com/artworks/original.jpg") {
  const user = await prisma.user.create({
    data: { email: "seller@orient-test.com", name: "Orient Test", roles: ["SELLER"] },
  });
  const artwork = await prisma.artwork.create({
    data: {
      sellerId: user.id,
      title: "Orientation Test",
      artist: "Orient Test",
      description: "Testing EXIF orientation",
      status: "PUBLISHED",
    },
  });
  const image = await prisma.artworkImage.create({
    data: { artworkId: artwork.id, url: imageUrl, isPrimary: true, order: 0 },
  });
  return image;
}

function mockFetchWithBuffer(buf: Buffer) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: vi.fn().mockResolvedValue(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
  });
}

// ─── BUG-1 — Portrait image orientation ───────────────────────────────────────

describe("BUG-1 — variant generation respects EXIF orientation", () => {
  beforeEach(async () => {
    await resetDatabase();
    for (const key of Object.keys(putBuffers)) delete putBuffers[key];
  });

  afterEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  const cases: Array<{ orientation: 1 | 3 | 6 | 8; label: string }> = [
    { orientation: 1, label: "normal (orientation 1)" },
    { orientation: 3, label: "180° (orientation 3)" },
    { orientation: 6, label: "90° CW / phone portrait (orientation 6)" },
    { orientation: 8, label: "90° CCW (orientation 8)" },
  ];

  for (const { orientation, label } of cases) {
    it(`portrait source image ${label} produces portrait display and grid variants`, async () => {
      const logicalW = 200;
      const logicalH = 400;

      const jpegBuf = await makeOrientedJpeg(logicalW, logicalH, orientation);
      const image = await seedImage();
      mockFetchWithBuffer(jpegBuf);

      const result = await generateVariants(image.id);
      expect(result, "generateVariants should succeed").not.toBeNull();

      // Check display variant
      const displayKey = Object.keys(putBuffers).find((k) => k.includes("display"));
      expect(displayKey, "display variant should be written").toBeTruthy();
      const displayMeta = await sharp(putBuffers[displayKey!]).metadata();
      expect(
        (displayMeta.height ?? 0) > (displayMeta.width ?? 0),
        `display variant should be portrait (got ${displayMeta.width}×${displayMeta.height})`,
      ).toBe(true);

      // Check grid variant
      const gridKey = Object.keys(putBuffers).find((k) => k.includes("grid"));
      expect(gridKey, "grid variant should be written").toBeTruthy();
      const gridMeta = await sharp(putBuffers[gridKey!]).metadata();
      expect(
        (gridMeta.height ?? 0) > (gridMeta.width ?? 0),
        `grid variant should be portrait (got ${gridMeta.width}×${gridMeta.height})`,
      ).toBe(true);

      // Thumbnail is always square
      const thumbKey = Object.keys(putBuffers).find((k) => k.includes("thumbnail"));
      expect(thumbKey, "thumbnail variant should be written").toBeTruthy();
      const thumbMeta = await sharp(putBuffers[thumbKey!]).metadata();
      expect(thumbMeta.width).toBe(400);
      expect(thumbMeta.height).toBe(400);

      // Clear captured buffers between cases that share beforeEach
      for (const key of Object.keys(putBuffers)) delete putBuffers[key];
    });
  }
});
