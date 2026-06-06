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

export async function generateVariants(imageId: string): Promise<VariantUrls | null> {
  try {
    const image = await prisma.artworkImage.findUnique({
      where: { id: imageId },
    });
    if (!image) return null;

    const response = await fetch(image.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

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
    const watermarkSvg = buildWatermarkSvg(W, H);
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

    // Use a timestamp in the path so each generation produces a unique URL.
    // Overwriting the same path would leave the old content cached in Vercel's
    // CDN indefinitely; a new path guarantees browsers and the CDN serve fresh
    // content immediately. Orphaned blobs from previous generations are small
    // and harmless.
    const ts = Date.now();
    const [displayBlob, gridBlob, thumbnailBlob] = await Promise.all([
      put(`artworks/variants/${imageId}-display-${ts}.jpg`, displayBuffer, {
        access: "public",
        contentType: "image/jpeg",
        token: BLOB_TOKEN,
      }),
      put(`artworks/variants/${imageId}-grid-${ts}.jpg`, gridBuffer, {
        access: "public",
        contentType: "image/jpeg",
        token: BLOB_TOKEN,
      }),
      put(`artworks/variants/${imageId}-thumbnail-${ts}.jpg`, thumbnailBuffer, {
        access: "public",
        contentType: "image/jpeg",
        token: BLOB_TOKEN,
      }),
    ]);

    const urls: VariantUrls = {
      displayUrl: displayBlob.url,
      gridUrl: gridBlob.url,
      thumbnailUrl: thumbnailBlob.url,
    };

    await prisma.artworkImage.update({
      where: { id: imageId },
      data: urls,
    });

    return urls;
  } catch (err) {
    console.error("[generateVariants] failed for imageId", imageId, err);
    return null;
  }
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
    >Art &amp; Sol</text>
  </svg>`;
  return Buffer.from(svg);
}
