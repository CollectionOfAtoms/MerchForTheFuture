import sharp from "sharp";

/**
 * Make the (white) background of a mockup transparent so a seller-chosen backdrop can
 * composite behind it (US-MFTF-17.14 follow-up — Printify's generated mockups bake in a
 * white studio background, unlike Teemill's transparent PNGs).
 *
 * Uses an **edge-connected flood fill**: only near-white pixels reachable from the image
 * border are cleared, so white *inside* the garment or design (an island not touching the
 * border) is preserved. This avoids punching holes in white design elements — the main
 * failure mode of a naive "all white → transparent" threshold. Anti-aliased edge pixels
 * that are lighter than the threshold may leave a faint halo (an accepted tradeoff).
 *
 * Returns a PNG buffer (with alpha). Threshold is per-channel 0–255; a pixel counts as
 * background when R, G and B are all ≥ threshold.
 */
export async function removeWhiteBackground(
  input: Buffer,
  opts: { threshold?: number } = {},
): Promise<Buffer> {
  const threshold = opts.threshold ?? 240;

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels === 4 after ensureAlpha

  const isBackgroundish = (pixel: number): boolean => {
    const idx = pixel * channels;
    return data[idx] >= threshold && data[idx + 1] >= threshold && data[idx + 2] >= threshold;
  };

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const seed = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel] || !isBackgroundish(pixel)) return;
    visited[pixel] = 1;
    stack.push(pixel);
  };

  // Seed from every border pixel, then flood inward through connected background.
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }

  while (stack.length > 0) {
    const pixel = stack.pop()!;
    data[pixel * channels + 3] = 0; // clear alpha
    const x = pixel % width;
    const y = (pixel / width) | 0;
    seed(x - 1, y);
    seed(x + 1, y);
    seed(x, y - 1);
    seed(x, y + 1);
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}
