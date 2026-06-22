import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

// Mockups are watermarked (corner mark) server-side before persisting — mock the
// Sharp pipeline + Blob so the stored URL is the watermarked output.
const mockSharpInst = {
  rotate: vi.fn().mockReturnThis(),
  toColorspace: vi.fn().mockReturnThis(),
  flatten: vi.fn().mockReturnThis(),
  resize: vi.fn().mockReturnThis(),
  composite: vi.fn().mockReturnThis(),
  jpeg: vi.fn().mockReturnThis(),
  toBuffer: vi.fn().mockResolvedValue(Buffer.from("watermarked")),
  metadata: vi.fn().mockResolvedValue({ width: 1200, height: 1500 }),
};
vi.mock("sharp", () => ({ default: vi.fn(() => mockSharpInst) }));
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockImplementation(async (path: string) => ({ url: `https://blob.vercel.com/${path}` })),
  del: vi.fn().mockResolvedValue(undefined),
}));

const { setSizeMockupAction, removeSizeMockupAction } = await import("@/app/actions/listings");
const { getMockupsForArtwork, getPrintReadiness } = await import("@/lib/print/framing");
const { auth } = await import("@/auth");

const PRODUCTS = [
  { sku: "GLOBAL-CAN-8X10", size: "8×10 in", price: 90 },
  { sku: "GLOBAL-FAP-12X18", size: "12×18 in", price: 60 },
];

describe("US-MFTF-PF.6 — Seller Per-Size Mockup Upload (action)", () => {
  let sellerId: string;
  let artworkId: string;
  let listingId: string;

  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSharpInst.rotate.mockClear().mockReturnThis();
    mockSharpInst.toColorspace.mockClear().mockReturnThis();
    mockSharpInst.flatten.mockClear().mockReturnThis();
    mockSharpInst.resize.mockClear().mockReturnThis();
    mockSharpInst.composite.mockClear().mockReturnThis();
    mockSharpInst.jpeg.mockClear().mockReturnThis();
    mockSharpInst.toBuffer.mockClear().mockResolvedValue(Buffer.from("watermarked"));
    mockSharpInst.metadata.mockClear().mockResolvedValue({ width: 1200, height: 1500 });
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
        status: "UNLISTED",
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

  it("applies the corner brand mark and stores the watermarked output keyed by [artworkId, sizeSku]", async () => {
    const result = await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "https://blob.vercel.com/raw-upload.jpg");
    expect(result).toEqual({ success: true });

    // Corner mark — composited SVG carries "MFTF" (not the diagonal "Merch for the Future").
    expect(mockSharpInst.composite).toHaveBeenCalledOnce();
    const svg = (mockSharpInst.composite.mock.calls[0][0] as Array<{ input: Buffer }>)[0].input.toString();
    expect(svg).toContain("MFTF");
    expect(svg).not.toContain("Merch for the Future");

    const mockups = await getMockupsForArtwork(artworkId);
    expect(mockups).toHaveLength(1);
    // Stored URL is the watermarked Blob output (not the raw upload), scoped to artwork+size.
    expect(mockups[0].mockupUrl).toContain("blob.vercel.com");
    expect(mockups[0].mockupUrl).toContain("print-mockups");
    expect(mockups[0].mockupUrl).toContain(artworkId);
    expect(mockups[0].mockupUrl).not.toContain("raw-upload");
  });

  it("overwrites the prior mockup for the same size on replace", async () => {
    await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "https://blob/old.jpg");
    await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "https://blob/new.jpg");
    const mockups = await getMockupsForArtwork(artworkId);
    expect(mockups).toHaveLength(1);
    expect(mockups[0].mockupUrl).toContain("blob.vercel.com"); // single watermarked row
  });

  it("removing a mockup clears the row and the PF.4 gate then reports it missing", async () => {
    await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "https://blob/a.jpg");
    await removeSizeMockupAction(listingId, "GLOBAL-CAN-8X10");
    expect(await getMockupsForArtwork(artworkId)).toHaveLength(0);
    const readiness = await getPrintReadiness(artworkId);
    expect(readiness.missingSizes).toContain("GLOBAL-CAN-8X10");
  });

  it("returns an error (no crash) and stores nothing if watermarking fails", async () => {
    mockSharpInst.toBuffer.mockRejectedValueOnce(new Error("sharp boom"));
    const result = await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "https://blob/a.jpg");
    expect(result).toHaveProperty("error");
    expect(await getMockupsForArtwork(artworkId)).toHaveLength(0);
  });

  it("rejects an empty / non-URL mockup value", async () => {
    expect(await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "")).toHaveProperty("error");
    expect(await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "not-a-url")).toHaveProperty("error");
  });

  it("rejects a size the listing does not offer", async () => {
    const result = await setSizeMockupAction(listingId, "GLOBAL-CAN-99X99", "https://blob/a.jpg");
    expect(result).toHaveProperty("error");
  });

  it("rejects a non-owner on set and remove", async () => {
    const other = await prisma.user.create({
      data: { email: "o@test.com", name: "O", passwordHash: "x", roles: ["SELLER"] },
    });
    vi.mocked(auth).mockResolvedValue({ user: { id: other.id, roles: ["SELLER"] } } as never);
    expect(await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "https://blob/a.jpg")).toHaveProperty("error");
    expect(await removeSizeMockupAction(listingId, "GLOBAL-CAN-8X10")).toHaveProperty("error");
  });
});
