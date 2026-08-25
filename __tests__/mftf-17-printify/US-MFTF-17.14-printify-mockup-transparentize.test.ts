import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sharp from "sharp";
import { prisma, resetDatabase } from "../helpers/db";

// Blob upload + the network fetch of the Printify image are mocked; the real sharp
// background removal runs on a synthetic white-bordered PNG.
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (path: string) => ({ url: `https://blob.example/${path}` })),
}));

const { put } = await import("@vercel/blob");
const { transparentizePrintifyMockups, isRawPrintifyMockup } = await import(
  "@/lib/fulfillment/printify"
);

const RAW_MOCKUP = "https://images-api.printify.com/mockup/abc/the-tee.jpg?camera_label=front";
const ALREADY_BLOB = "https://blob.example/apparel/printify-mockups/existing.png";

async function whiteBorderedPng(): Promise<Buffer> {
  const W = 4, H = 4;
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const white = i === 5 || i === 6 || i === 9 || i === 10 ? false : true; // centre 2×2 non-white
    const o = i * 4;
    buf[o] = white ? 255 : 10;
    buf[o + 1] = white ? 255 : 10;
    buf[o + 2] = white ? 255 : 10;
    buf[o + 3] = 255;
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

async function seedListingWithMockups() {
  const seller = await prisma.user.create({
    data: { email: `s-${crypto.randomUUID()}@t.com`, roles: ["SELLER"] as never },
  });
  return prisma.apparelListing.create({
    data: {
      sellerId: seller.id,
      sourcingMode: "REFERENCED",
      status: "ACTIVE",
      title: "Tee",
      retailPrice: 40,
      providerKey: "printify",
      providerProductRef: "prod-1",
      referencedVariants: {
        create: [
          // Two variants share one raw Printify mockup (same colour, two sizes).
          { variantRef: "1", colorName: "White", colorHex: "#fff", sizeLabel: "S", stockLevel: 0, isOrderable: true, mockupUrl: RAW_MOCKUP },
          { variantRef: "2", colorName: "White", colorHex: "#fff", sizeLabel: "M", stockLevel: 0, isOrderable: true, mockupUrl: RAW_MOCKUP },
          // Already-processed blob mockup — must be left alone.
          { variantRef: "3", colorName: "Black", colorHex: "#111", sizeLabel: "S", stockLevel: 0, isOrderable: true, mockupUrl: ALREADY_BLOB },
        ],
      },
    },
    include: { referencedVariants: true },
  });
}

describe("US-MFTF-17.14 — isRawPrintifyMockup", () => {
  it("matches Printify-hosted images and nothing else", () => {
    expect(isRawPrintifyMockup(RAW_MOCKUP)).toBe(true);
    expect(isRawPrintifyMockup("https://images.printify.com/x.png")).toBe(true);
    expect(isRawPrintifyMockup(ALREADY_BLOB)).toBe(false);
    expect(isRawPrintifyMockup(null)).toBe(false);
    expect(isRawPrintifyMockup("not a url")).toBe(false);
  });
});

describe("US-MFTF-17.14 — transparentizePrintifyMockups", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => await whiteBorderedPng() })),
    );
  });
  afterEach(async () => {
    await resetDatabase();
    vi.unstubAllGlobals();
  });

  it("replaces raw Printify mockups with a transparent blob PNG and skips already-processed ones", async () => {
    const listing = await seedListingWithMockups();
    await transparentizePrintifyMockups(listing.id);

    const rows = await prisma.referencedVariant.findMany({
      where: { apparelListingId: listing.id },
      orderBy: { variantRef: "asc" },
    });
    // Both White rows (shared raw mockup) now point at the uploaded blob.
    expect(rows[0].mockupUrl).toContain("blob.example/apparel/printify-mockups/");
    expect(rows[1].mockupUrl).toBe(rows[0].mockupUrl);
    // The already-blob Black row is untouched.
    expect(rows[2].mockupUrl).toBe(ALREADY_BLOB);

    // Uploaded exactly once (one distinct raw mockup), as a PNG.
    expect(put).toHaveBeenCalledTimes(1);
    const [path, body, options] = vi.mocked(put).mock.calls[0];
    expect(path).toMatch(/\.png$/);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect((options as { contentType?: string }).contentType).toBe("image/png");
    // The uploaded PNG actually has alpha (background was removed).
    expect((await sharp(body as Buffer).metadata()).hasAlpha).toBe(true);
  });

  it("is a no-op when there are no raw Printify mockups", async () => {
    const seller = await prisma.user.create({
      data: { email: `s2-${crypto.randomUUID()}@t.com`, roles: ["SELLER"] as never },
    });
    const listing = await prisma.apparelListing.create({
      data: {
        sellerId: seller.id, sourcingMode: "REFERENCED", status: "ACTIVE", title: "Tee",
        retailPrice: 40, providerKey: "printify", providerProductRef: "prod-2",
        referencedVariants: { create: [{ variantRef: "9", colorName: "White", colorHex: "#fff", sizeLabel: "S", stockLevel: 0, isOrderable: true, mockupUrl: ALREADY_BLOB }] },
      },
    });
    await transparentizePrintifyMockups(listing.id);
    expect(put).not.toHaveBeenCalled();
  });
});
