import sharp from "sharp";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";

const BLOB_TOKEN =
  process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

export interface VariantUrls {
  displayUrl: string;
  gridUrl: string;
  thumbnailUrl: string;
}

/**
 * Watermark style applied to the display variant.
 * - `diagonal`: aggressive full-image overlay for fine-art originals and prints.
 * - `corner`: small brand mark in the bottom-right corner for apparel lifestyle
 *   photos — brand identification without degrading the marketing value.
 */
export type WatermarkStyle = "diagonal" | "corner";

interface VariantBuffers {
  displayBuffer: Buffer;
  gridBuffer: Buffer;
  thumbnailBuffer: Buffer;
}

/**
 * Pure image-processing step shared by every variant generator. Produces the
 * three JPEG variant buffers from a source image buffer. The display variant is
 * watermarked according to `watermarkStyle`; grid and thumbnail are never
 * watermarked. The sharp call sequence here is relied upon by the US-18.2 tests.
 */
async function buildVariantBuffers(
  imageBuffer: Buffer,
  watermarkStyle: WatermarkStyle,
): Promise<VariantBuffers> {
  // Normalise to sRGB + flatten alpha so all three variants can be JPEG-encoded.
  // This handles CMYK TIFFs (common in print-ready files) and TIFFs with alpha.
  const normalizedBuffer = await sharp(imageBuffer)
    .rotate()
    .toColorspace("srgb")
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toBuffer();

  // Display variant — watermarked, max 2400px long edge, JPEG 85
  // Resize first so we know the exact output dimensions, then build a
  // matching SVG (sharp requires the overlay to be ≤ the base image size).
  const resizedBuffer = await sharp(normalizedBuffer)
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .toBuffer();
  const { width: W = 2400, height: H = 2400 } = await sharp(resizedBuffer).metadata();
  const watermarkSvg =
    watermarkStyle === "corner"
      ? buildCornerWatermarkSvg(W, H)
      : buildWatermarkSvg(W, H);
  const displayBuffer = await sharp(resizedBuffer)
    .composite([{ input: watermarkSvg, gravity: "center" }])
    .jpeg({ quality: 85 })
    .toBuffer();

  // Grid variant — un-watermarked, max 800px long edge, JPEG 75
  const gridBuffer = await sharp(normalizedBuffer)
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();

  // Thumbnail variant — 400×400 cover crop, JPEG 70
  const thumbnailBuffer = await sharp(normalizedBuffer)
    .resize(400, 400, { fit: "cover" })
    .jpeg({ quality: 70 })
    .toBuffer();

  return { displayBuffer, gridBuffer, thumbnailBuffer };
}

/**
 * Upload the three variant buffers to Vercel Blob under `pathPrefix` and return
 * their public URLs. A timestamp in the path makes each generation produce a
 * unique URL so browsers and the Vercel CDN serve fresh content immediately
 * rather than the previously-cached variant. Orphaned blobs are small/harmless.
 */
async function uploadVariants(pathPrefix: string, buffers: VariantBuffers): Promise<VariantUrls> {
  const ts = Date.now();
  const [displayBlob, gridBlob, thumbnailBlob] = await Promise.all([
    put(`${pathPrefix}-display-${ts}.jpg`, buffers.displayBuffer, {
      access: "public",
      contentType: "image/jpeg",
      token: BLOB_TOKEN,
    }),
    put(`${pathPrefix}-grid-${ts}.jpg`, buffers.gridBuffer, {
      access: "public",
      contentType: "image/jpeg",
      token: BLOB_TOKEN,
    }),
    put(`${pathPrefix}-thumbnail-${ts}.jpg`, buffers.thumbnailBuffer, {
      access: "public",
      contentType: "image/jpeg",
      token: BLOB_TOKEN,
    }),
  ]);

  return {
    displayUrl: displayBlob.url,
    gridUrl: gridBlob.url,
    thumbnailUrl: thumbnailBlob.url,
  };
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate display/grid/thumbnail variants for an `ArtworkImage` (fine-art
 * originals and prints). Uses the diagonal watermark by default.
 */
export async function generateVariants(
  imageId: string,
  watermarkStyle: WatermarkStyle = "diagonal",
): Promise<VariantUrls | null> {
  try {
    const image = await prisma.artworkImage.findUnique({ where: { id: imageId } });
    if (!image) return null;

    const imageBuffer = await fetchImageBuffer(image.url);
    const buffers = await buildVariantBuffers(imageBuffer, watermarkStyle);
    const urls = await uploadVariants(`artworks/variants/${imageId}`, buffers);

    await prisma.artworkImage.update({ where: { id: imageId }, data: urls });
    return urls;
  } catch (err) {
    console.error("[generateVariants] failed for imageId", imageId, err);
    return null;
  }
}

/**
 * Generate display/grid/thumbnail variants for an `ApparelListingImage`
 * (lifestyle photos). Always uses the corner watermark so brand identification
 * is present without degrading the marketing value of the photo. The clean
 * design file sent to the dropshipper bypasses this pipeline entirely.
 */
export async function generateApparelImageVariants(
  apparelImageId: string,
): Promise<VariantUrls | null> {
  try {
    const image = await prisma.apparelListingImage.findUnique({ where: { id: apparelImageId } });
    if (!image) return null;

    const imageBuffer = await fetchImageBuffer(image.originalUrl);
    const buffers = await buildVariantBuffers(imageBuffer, "corner");
    const urls = await uploadVariants(`apparel/variants/${apparelImageId}`, buffers);

    await prisma.apparelListingImage.update({ where: { id: apparelImageId }, data: urls });
    return urls;
  } catch (err) {
    console.error("[generateApparelImageVariants] failed for apparelImageId", apparelImageId, err);
    return null;
  }
}

/**
 * Crop a print source image to a normalized `[0..1]` rect and upload the result to
 * Blob (US-MFTF-PF.3). The rect is resolved against the rotated (EXIF-corrected)
 * source pixels so the produced crop's pixel aspect matches the locked target. Returns
 * the public URL. Used by the framing confirm action; the resulting `croppedUrl` is the
 * production file sent to Prodigi (US-MFTF-PF.5) — never watermarked.
 */
export async function generatePrintCrop(
  sourceUrl: string,
  rect: { x: number; y: number; w: number; h: number },
  pathPrefix: string,
): Promise<string> {
  const sourceBuffer = await fetchImageBuffer(sourceUrl);
  // Apply EXIF rotation first so the rect is resolved against the displayed pixels.
  const rotated = await sharp(sourceBuffer).rotate().toColorspace("srgb").toBuffer();
  const { width: W = 0, height: H = 0 } = await sharp(rotated).metadata();
  if (!W || !H) throw new Error("Could not read source image dimensions for crop.");

  const left = Math.min(Math.max(Math.round(rect.x * W), 0), W - 1);
  const top = Math.min(Math.max(Math.round(rect.y * H), 0), H - 1);
  const width = Math.min(Math.max(Math.round(rect.w * W), 1), W - left);
  const height = Math.min(Math.max(Math.round(rect.h * H), 1), H - top);

  const cropped = await sharp(rotated)
    .extract({ left, top, width, height })
    .jpeg({ quality: 90 })
    .toBuffer();

  const blob = await put(`${pathPrefix}-${Date.now()}.jpg`, cropped, {
    access: "public",
    contentType: "image/jpeg",
    token: BLOB_TOKEN,
  });
  return blob.url;
}

function buildWatermarkSvg(width: number, height: number): Buffer {
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const fontSize = Math.round(Math.min(width, height) * 0.18);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <text
      x="${cx}"
      y="${cy}"
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="${fontSize}"
      font-family="sans-serif"
      font-weight="600"
      fill="rgba(150,150,150,0.30)"
      transform="rotate(-30, ${cx}, ${cy})"
    >Merch for the Future</text>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * Small brand mark in the bottom-right corner at ~8% of the image width and 70%
 * opacity. A subtle dark stroke keeps it legible over light photo backgrounds.
 */
function buildCornerWatermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.round(width * 0.08);
  const pad = Math.round(width * 0.03);
  const x = width - pad;
  const y = height - pad;
  const stroke = Math.max(1, Math.round(fontSize * 0.04));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <text
      x="${x}"
      y="${y}"
      text-anchor="end"
      dominant-baseline="alphabetic"
      font-size="${fontSize}"
      font-family="sans-serif"
      font-weight="700"
      fill="rgba(255,255,255,0.70)"
      stroke="rgba(0,0,0,0.25)"
      stroke-width="${stroke}"
      paint-order="stroke"
    >MFTF</text>
  </svg>`;
  return Buffer.from(svg);
}
