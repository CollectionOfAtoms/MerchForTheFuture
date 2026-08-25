import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { removeWhiteBackground } from "@/lib/apparel/white-bg-removal";

const W = 5;
const H = 5;

/**
 * A 5×5 test image:
 *   - white border on all four edges (the "studio background"),
 *   - a black ring just inside it,
 *   - a single WHITE pixel at the centre (an island NOT connected to the border).
 * Edge-connected flood fill should clear the border white but preserve the centre.
 */
function buildFixture(): Promise<Buffer> {
  const buf = Buffer.alloc(W * H * 4);
  const set = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    const i = (y * W + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  // Everything white + opaque to start.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, 255, 255, 255, 255);
  // Black ring around the centre (the interior 3×3 box minus its centre).
  for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]]) {
    set(x, y, 0, 0, 0, 255);
  }
  // Centre (2,2) stays white — a disconnected white island.
  return sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * W + x) * 4 + 3];
}

describe("US-MFTF-17.14 — removeWhiteBackground (edge-connected flood fill)", () => {
  it("clears the border/background white to transparent", async () => {
    const out = await removeWhiteBackground(await buildFixture());
    expect(await alphaAt(out, 0, 0)).toBe(0); // corner
    expect(await alphaAt(out, 4, 4)).toBe(0); // opposite corner
    expect(await alphaAt(out, 2, 0)).toBe(0); // top edge
  });

  it("preserves a white island that is not connected to the border", async () => {
    const out = await removeWhiteBackground(await buildFixture());
    expect(await alphaAt(out, 2, 2)).toBe(255); // interior white stays opaque
  });

  it("leaves non-white (the black ring) fully opaque", async () => {
    const out = await removeWhiteBackground(await buildFixture());
    expect(await alphaAt(out, 1, 1)).toBe(255);
    expect(await alphaAt(out, 2, 1)).toBe(255);
  });

  it("returns a PNG (supports alpha)", async () => {
    const out = await removeWhiteBackground(await buildFixture());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
  });
});
