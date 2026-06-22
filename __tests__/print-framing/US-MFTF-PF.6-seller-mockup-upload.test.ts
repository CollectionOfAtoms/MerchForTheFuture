import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

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

  it("persists a mockup URL verbatim (no watermark/variant processing) keyed by [artworkId, sizeSku]", async () => {
    const url = "https://blob.vercel.com/print-mockups/x/GLOBAL-CAN-8X10.jpg";
    const result = await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", url);
    expect(result).toEqual({ success: true });
    const mockups = await getMockupsForArtwork(artworkId);
    expect(mockups).toHaveLength(1);
    expect(mockups[0].mockupUrl).toBe(url); // stored exactly as uploaded
  });

  it("overwrites the prior mockup for the same size on replace", async () => {
    await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "https://blob/old.jpg");
    await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "https://blob/new.jpg");
    const mockups = await getMockupsForArtwork(artworkId);
    expect(mockups).toHaveLength(1);
    expect(mockups[0].mockupUrl).toBe("https://blob/new.jpg");
  });

  it("removing a mockup clears the row and the PF.4 gate then reports it missing", async () => {
    await setSizeMockupAction(listingId, "GLOBAL-CAN-8X10", "https://blob/a.jpg");
    await removeSizeMockupAction(listingId, "GLOBAL-CAN-8X10");
    expect(await getMockupsForArtwork(artworkId)).toHaveLength(0);
    const readiness = await getPrintReadiness(artworkId);
    expect(readiness.missingSizes).toContain("GLOBAL-CAN-8X10");
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
