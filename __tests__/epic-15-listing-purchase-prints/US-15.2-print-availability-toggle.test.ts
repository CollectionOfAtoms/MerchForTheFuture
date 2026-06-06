import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { updatePrintConfigAction } = await import("@/app/actions/listings");
const { browseArtworks } = await import("@/lib/artworks/browse");
const { getArtworkDetail } = await import("@/lib/artworks/detail");
const { auth } = await import("@/auth");

describe("US-15.2 — Print Availability Toggle on Listing", () => {
  let sellerId: string;
  let artworkId: string;
  let listingId: string;

  beforeEach(async () => {
    await resetDatabase();

    const seller = await prisma.user.create({
      data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER"] },
    });
    sellerId = seller.id;

    const artwork = await prisma.artwork.create({
      data: {
        title: "Wind Farm",
        description: "A scenic wind farm",
        sellerId,
        status: "PUBLISHED",
        images: { create: [{ url: "https://example.com/img.jpg", isPrimary: true, order: 0 }] },
      },
    });
    artworkId = artwork.id;

    const listing = await prisma.originalListing.create({
      data: { artworkId, saleType: "FIXED_PRICE", price: 800, currency: "USD", status: "ACTIVE" },
    });
    listingId = listing.id;

    vi.mocked(auth).mockResolvedValue({ user: { id: sellerId, roles: ["SELLER"] } } as never);
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  const validPrintProducts = JSON.stringify([
    { sku: "GLOBAL-FAP-16x12", description: "Fine Art Print 16x12", size: "16x12", price: 45 },
    { sku: "GLOBAL-FAP-24x18", description: "Fine Art Print 24x18", size: "24x18", price: 75 },
  ]);

  describe("toggle ON", () => {
    it("saves availableForPrint=true on the OriginalListing", async () => {
      const fd = new FormData();
      fd.set("availableForPrint", "true");
      fd.set("printSourceImageUrl", "https://cdn.example.com/hires.jpg");
      fd.set("printProducts", validPrintProducts);

      await updatePrintConfigAction(listingId, fd);

      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.availableForPrint).toBe(true);
    });

    it("saves printSourceImageUrl on the OriginalListing", async () => {
      const fd = new FormData();
      fd.set("availableForPrint", "true");
      fd.set("printSourceImageUrl", "https://cdn.example.com/hires.jpg");
      fd.set("printProducts", validPrintProducts);

      await updatePrintConfigAction(listingId, fd);

      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.printSourceImageUrl).toBe("https://cdn.example.com/hires.jpg");
    });

    it("saves printProducts JSON on the OriginalListing", async () => {
      const fd = new FormData();
      fd.set("availableForPrint", "true");
      fd.set("printSourceImageUrl", "https://cdn.example.com/hires.jpg");
      fd.set("printProducts", validPrintProducts);

      await updatePrintConfigAction(listingId, fd);

      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      const products = listing!.printProducts as { sku: string }[];
      expect(Array.isArray(products)).toBe(true);
      expect(products[0].sku).toBe("GLOBAL-FAP-16x12");
    });

    it("returns error when printSourceImageUrl is missing", async () => {
      const fd = new FormData();
      fd.set("availableForPrint", "true");
      fd.set("printProducts", validPrintProducts);

      const result = await updatePrintConfigAction(listingId, fd);
      expect(result).toHaveProperty("error");
    });

    it("returns error when no print products are provided", async () => {
      const fd = new FormData();
      fd.set("availableForPrint", "true");
      fd.set("printSourceImageUrl", "https://cdn.example.com/hires.jpg");
      fd.set("printProducts", "[]");

      const result = await updatePrintConfigAction(listingId, fd);
      expect(result).toHaveProperty("error");
    });
  });

  describe("toggle OFF", () => {
    beforeEach(async () => {
      await prisma.originalListing.update({
        where: { id: listingId },
        data: {
          availableForPrint: true,
          printSourceImageUrl: "https://cdn.example.com/hires.jpg",
          printProducts: JSON.parse(validPrintProducts),
        },
      });
    });

    it("sets availableForPrint=false but preserves config", async () => {
      const fd = new FormData();
      // no "availableForPrint" key means false

      await updatePrintConfigAction(listingId, fd);

      const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
      expect(listing!.availableForPrint).toBe(false);
      // Config is preserved
      expect(listing!.printSourceImageUrl).toBe("https://cdn.example.com/hires.jpg");
    });
  });

  describe("authorization", () => {
    it("rejects if the user does not own the listing", async () => {
      const other = await prisma.user.create({
        data: { email: "other@test.com", name: "Other", passwordHash: "x", roles: ["SELLER"] },
      });
      vi.mocked(auth).mockResolvedValue({ user: { id: other.id, roles: ["SELLER"] } } as never);

      const fd = new FormData();
      fd.set("availableForPrint", "true");
      fd.set("printSourceImageUrl", "https://cdn.example.com/hires.jpg");
      fd.set("printProducts", validPrintProducts);

      const result = await updatePrintConfigAction(listingId, fd);
      expect(result).toHaveProperty("error");
    });

    it("redirects unauthenticated users", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const fd = new FormData();
      await expect(updatePrintConfigAction(listingId, fd)).rejects.toThrow("NEXT_REDIRECT");
    });
  });

  describe("getArtworkDetail — print config from OriginalListing", () => {
    it("returns availableForPrint from OriginalListing", async () => {
      await prisma.originalListing.update({
        where: { id: listingId },
        data: {
          availableForPrint: true,
          printSourceImageUrl: "https://cdn.example.com/hires.jpg",
          printProducts: JSON.parse(validPrintProducts),
        },
      });

      const detail = await getArtworkDetail(artworkId);
      expect(detail!.original!.availableForPrint).toBe(true);
    });

    it("returns printProducts from OriginalListing", async () => {
      await prisma.originalListing.update({
        where: { id: listingId },
        data: {
          availableForPrint: true,
          printSourceImageUrl: "https://cdn.example.com/hires.jpg",
          printProducts: JSON.parse(validPrintProducts),
        },
      });

      const detail = await getArtworkDetail(artworkId);
      expect(detail!.original!.printProducts).toBeTruthy();
    });
  });

  describe("browseArtworks — print availability filter", () => {
    it("returns listings with availableForPrint=true when filtering by 'print'", async () => {
      await prisma.originalListing.update({
        where: { id: listingId },
        data: { availableForPrint: true, printSourceImageUrl: "https://cdn.example.com/hires.jpg", printProducts: JSON.parse(validPrintProducts) },
      });

      const result = await browseArtworks({ filters: { availability: "print" } });
      expect(result.artworks.some((a) => a.id === artworkId)).toBe(true);
    });

    it("excludes listings with availableForPrint=false from print filter", async () => {
      // listing stays with availableForPrint=false (default)
      const result = await browseArtworks({ filters: { availability: "print" } });
      expect(result.artworks.some((a) => a.id === artworkId)).toBe(false);
    });

    it("includes SOLD originals with availableForPrint=true in print filter", async () => {
      await prisma.originalListing.update({
        where: { id: listingId },
        data: {
          availableForPrint: true,
          printSourceImageUrl: "https://cdn.example.com/hires.jpg",
          printProducts: JSON.parse(validPrintProducts),
          status: "SOLD",
        },
      });

      const result = await browseArtworks({ filters: { availability: "print" } });
      expect(result.artworks.some((a) => a.id === artworkId)).toBe(true);
    });

    it("hasPrint flag is true when availableForPrint=true", async () => {
      await prisma.originalListing.update({
        where: { id: listingId },
        data: { availableForPrint: true, printSourceImageUrl: "https://cdn.example.com/hires.jpg", printProducts: JSON.parse(validPrintProducts) },
      });

      const result = await browseArtworks({});
      const card = result.artworks.find((a) => a.id === artworkId);
      expect(card!.hasPrint).toBe(true);
    });

    it("hasPrint flag is false when availableForPrint=false", async () => {
      const result = await browseArtworks({});
      const card = result.artworks.find((a) => a.id === artworkId);
      expect(card!.hasPrint).toBe(false);
    });
  });
});
