import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { setListingStatusAction, toggleListingStatusAction, updatePrintConfigAction } = await import("@/app/actions/listings");
const { upsertFraming, upsertSizeMockup, getFramingForArtwork, offeredSizes } = await import("@/lib/print/framing");
const { auth } = await import("@/auth");

const PRODUCTS = [
  { sku: "GLOBAL-CAN-8X10", size: "8×10 in", price: 90 },
  { sku: "GLOBAL-FAP-12X18", size: "12×18 in", price: 60 },
];

describe("US-MFTF-PF.4 — Publish/Activation Gate + Reframe Alerts", () => {
  let sellerId: string;
  let artworkId: string;
  let listingId: string;

  async function makeListing(opts: { status?: string; availableForPrint?: boolean; printProducts?: unknown } = {}) {
    const artwork = await prisma.artwork.create({
      data: {
        title: "Art",
        description: "d",
        sellerId,
        status: "PUBLISHED",
        images: { create: [{ url: "https://example.com/p.jpg", isPrimary: true, order: 0 }] },
      },
    });
    const listing = await prisma.originalListing.create({
      data: {
        artworkId: artwork.id,
        saleType: "FIXED_PRICE",
        price: 500,
        currency: "USD",
        status: (opts.status ?? "UNLISTED") as never,
        availableForPrint: opts.availableForPrint ?? false,
        printSourceImageUrl: "https://cdn.example.com/hires.jpg",
        printProducts: (opts.printProducts ?? null) as never,
      },
    });
    return { artworkId: artwork.id, listingId: listing.id };
  }

  async function frameAndMockAll(aId: string) {
    await upsertFraming(aId, "4:5", { croppedUrl: "https://blob/45.jpg", wrap: "MIRROR_WRAP" });
    await upsertFraming(aId, "2:3", { croppedUrl: "https://blob/23.jpg" });
    for (const sku of offeredSizes(PRODUCTS)) await upsertSizeMockup(aId, sku, `https://blob/${sku}.jpg`);
  }

  beforeEach(async () => {
    await resetDatabase();
    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "S", passwordHash: "x", roles: ["SELLER"] },
    });
    sellerId = seller.id;
    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
    const made = await makeListing({ availableForPrint: true, printProducts: PRODUCTS });
    artworkId = made.artworkId;
    listingId = made.listingId;
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  describe("activation gate", () => {
    it("blocks ACTIVE with an itemized error when an aspect is unframed", async () => {
      await upsertSizeMockup(artworkId, "GLOBAL-CAN-8X10", "https://blob/a.jpg");
      await upsertSizeMockup(artworkId, "GLOBAL-FAP-12X18", "https://blob/b.jpg");
      // both aspects unframed
      const result = await setListingStatusAction(listingId, "ACTIVE");
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toMatch(/framing for aspect/i);
      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.status).toBe("UNLISTED"); // not activated
    });

    it("blocks ACTIVE with an itemized error when a size has no mockup", async () => {
      await upsertFraming(artworkId, "4:5", { croppedUrl: "https://blob/45.jpg" });
      await upsertFraming(artworkId, "2:3", { croppedUrl: "https://blob/23.jpg" });
      await upsertSizeMockup(artworkId, "GLOBAL-CAN-8X10", "https://blob/a.jpg");
      // FAP-12X18 mockup missing
      const result = await setListingStatusAction(listingId, "ACTIVE");
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toMatch(/mockup/i);
      expect((result as { error: string }).error).toContain("12×18 in");
    });

    it("blocks ACTIVE when an aspect has a crop but needsReframe=true", async () => {
      await frameAndMockAll(artworkId);
      await upsertFraming(artworkId, "4:5", { needsReframe: true }); // crop present but flagged
      const result = await setListingStatusAction(listingId, "ACTIVE");
      expect(result).toHaveProperty("error");
      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.status).toBe("UNLISTED");
    });

    it("allows ACTIVE once every aspect is framed and every size is mocked", async () => {
      await frameAndMockAll(artworkId);
      const result = await setListingStatusAction(listingId, "ACTIVE");
      expect(result).toEqual({ success: true });
      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.status).toBe("ACTIVE");
    });

    it("gates toggleListingStatusAction → ACTIVE the same way", async () => {
      const result = await toggleListingStatusAction(listingId); // UNLISTED → would be... toggle is ACTIVE<->ARCHIVED
      // toggle from UNLISTED targets ACTIVE; incomplete → blocked
      expect(result).toHaveProperty("error");
      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.status).toBe("UNLISTED");
    });

    it("never blocks UNLISTED or ARCHIVED transitions", async () => {
      const unlist = await setListingStatusAction(listingId, "UNLISTED");
      expect(unlist).toEqual({ success: true });
      const archive = await setListingStatusAction(listingId, "ARCHIVED");
      expect(archive).toEqual({ success: true });
    });

    it("does not gate a prints-disabled listing", async () => {
      const { listingId: plainId } = await makeListing({ availableForPrint: false, status: "UNLISTED" });
      const result = await setListingStatusAction(plainId, "ACTIVE");
      expect(result).toEqual({ success: true });
    });
  });

  describe("art-replace invalidation (Decision E)", () => {
    it("clears crops + sets needsReframe for all framing rows when the source changes", async () => {
      await frameAndMockAll(artworkId);
      await prisma.originalListing.update({ where: { id: listingId }, data: { status: "ACTIVE" } });

      const fd = new FormData();
      fd.set("availableForPrint", "true");
      fd.set("printSourceImageUrl", "https://cdn.example.com/NEW-hires.jpg");
      fd.set("printProducts", JSON.stringify(PRODUCTS));
      const result = await updatePrintConfigAction(listingId, fd);
      expect(result).toEqual({ success: true });

      const framings = await getFramingForArtwork(artworkId);
      expect(framings.length).toBeGreaterThan(0);
      expect(framings.every((f) => f.croppedUrl === null && f.needsReframe)).toBe(true);
    });

    it("forces a previously-ACTIVE listing out of ACTIVE when the source is replaced", async () => {
      await frameAndMockAll(artworkId);
      await prisma.originalListing.update({ where: { id: listingId }, data: { status: "ACTIVE" } });

      const fd = new FormData();
      fd.set("availableForPrint", "true");
      fd.set("printSourceImageUrl", "https://cdn.example.com/NEW-hires.jpg");
      fd.set("printProducts", JSON.stringify(PRODUCTS));
      await updatePrintConfigAction(listingId, fd);

      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.status).not.toBe("ACTIVE");

      // and re-activation is now blocked until reframed
      const reactivate = await setListingStatusAction(listingId, "ACTIVE");
      expect(reactivate).toHaveProperty("error");
    });

    it("does not invalidate framing when the source URL is unchanged", async () => {
      await frameAndMockAll(artworkId);
      const fd = new FormData();
      fd.set("availableForPrint", "true");
      fd.set("printSourceImageUrl", "https://cdn.example.com/hires.jpg"); // same as seeded
      fd.set("printProducts", JSON.stringify(PRODUCTS));
      await updatePrintConfigAction(listingId, fd);

      const framings = await getFramingForArtwork(artworkId);
      expect(framings.every((f) => f.croppedUrl && !f.needsReframe)).toBe(true);
    });
  });
});
