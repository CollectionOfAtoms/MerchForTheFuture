import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { getApparelListingDetail } = await import("@/lib/apparel/detail");
const { getApparelListings } = await import("@/lib/apparel/browse");
const { browseArtworks } = await import("@/lib/artworks/browse");
const { getSellerActiveListings, getSellerListingSummary } = await import("@/lib/dashboard/seller");
const { setApparelListingStatusAction } = await import("@/app/actions/apparel");
const { setListingStatusAction } = await import("@/app/actions/listings");
const { auth } = await import("@/auth");

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Status = "ACTIVE" | "UNLISTED" | "ARCHIVED" | "SOLD";

async function seedSeller() {
  return prisma.user.create({
    data: { email: `seller-${crypto.randomUUID()}@test.com`, name: "S", roles: ["SELLER"] as never },
  });
}

function authAs(id: string, roles: string[] = ["SELLER"]) {
  vi.mocked(auth).mockResolvedValue({ user: { id, roles } } as never);
}

async function seedApparel(sellerId: string, status: Status, { withColor = false } = {}) {
  const pt = await prisma.productType.create({
    data: {
      name: `Tee ${crypto.randomUUID()}`,
      fulfillmentProvider: "PRODIGI",
      providerSkuBase: "RNA1",
      colors: withColor ? { create: [{ colorName: "White", providerColorCode: "White", colorImageUrl: "https://blob/w.png" }] } : undefined,
      sizes: { create: [{ sizeLabel: "M", providerSizeCode: "M", sortOrder: 1 }] },
    },
    include: { colors: true },
  });
  return prisma.apparelListing.create({
    data: {
      sellerId,
      sourcingMode: "DESIGNED",
      productTypeId: pt.id,
      title: "Bee Tee",
      retailPrice: 28,
      status,
      designImageUrl: "https://blob/d.png",
      ...(withColor ? { colors: { create: [{ productTypeColorId: pt.colors[0].id, isOffered: true }] } } : {}),
      images: { create: [{ originalUrl: "https://blob/ls.jpg", gridUrl: "https://blob/ls-grid.jpg", isPrimary: true, sortOrder: 0 }] },
    },
  });
}

async function seedArtwork(sellerId: string, status: Status, { availableForPrint = false } = {}) {
  const artwork = await prisma.artwork.create({
    data: { sellerId, title: `Art ${crypto.randomUUID()}`, artist: "A", description: "d", status: "PUBLISHED" },
  });
  await prisma.artworkImage.create({ data: { artworkId: artwork.id, url: "https://img/a.jpg", isPrimary: true, order: 0 } });
  const listing = await prisma.originalListing.create({
    data: {
      artworkId: artwork.id,
      saleType: "FIXED_PRICE",
      price: 100,
      status,
      availableForPrint,
      ...(availableForPrint ? { printProducts: [{ sku: "X", size: "A4", price: 20 }] } : {}),
    },
  });
  return { artwork, listing };
}

// ─── Detail pages render UNLISTED (viewable by direct link) ────────────────────

describe("UNLISTED — detail pages remain viewable by direct link", () => {
  afterEach(async () => { await resetDatabase(); vi.restoreAllMocks(); });

  it("apparel detail renders an UNLISTED listing", async () => {
    const seller = await seedSeller();
    const listing = await seedApparel(seller.id, "UNLISTED", { withColor: true });
    const detail = await getApparelListingDetail(listing.id);
    expect(detail).not.toBeNull();
    expect(detail!.title).toBe("Bee Tee");
  });

  it("apparel detail still 404s (null) for ARCHIVED and SOLD", async () => {
    const seller = await seedSeller();
    const archived = await seedApparel(seller.id, "ARCHIVED");
    const sold = await seedApparel(seller.id, "SOLD");
    expect(await getApparelListingDetail(archived.id)).toBeNull();
    expect(await getApparelListingDetail(sold.id)).toBeNull();
  });
});

// ─── Feeds exclude UNLISTED ────────────────────────────────────────────────────

describe("UNLISTED — hidden from all active feeds", () => {
  afterEach(async () => { await resetDatabase(); vi.restoreAllMocks(); });

  it("apparel browse excludes UNLISTED listings", async () => {
    const seller = await seedSeller();
    await seedApparel(seller.id, "ACTIVE", { withColor: true });
    await seedApparel(seller.id, "UNLISTED", { withColor: true });
    const { listings, total } = await getApparelListings();
    expect(total).toBe(1);
    expect(listings).toHaveLength(1);
  });

  it("artwork browse excludes UNLISTED listings", async () => {
    const seller = await seedSeller();
    await seedArtwork(seller.id, "ACTIVE");
    await seedArtwork(seller.id, "UNLISTED");
    const { artworks, total } = await browseArtworks({});
    expect(total).toBe(1);
    expect(artworks).toHaveLength(1);
  });

  it("artwork browse excludes UNLISTED even when print is available", async () => {
    const seller = await seedSeller();
    await seedArtwork(seller.id, "UNLISTED", { availableForPrint: true });
    const result = await browseArtworks({ filters: { availability: "print" } });
    expect(result.total).toBe(0);
  });

  it("seller dashboard active listings excludes UNLISTED", async () => {
    const seller = await seedSeller();
    await seedApparel(seller.id, "ACTIVE", { withColor: true });
    await seedApparel(seller.id, "UNLISTED", { withColor: true });
    const active = await getSellerActiveListings(seller.id);
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("ACTIVE");
  });

  it("count summary does not count UNLISTED as active, and reports it separately", async () => {
    const seller = await seedSeller();
    await seedApparel(seller.id, "ACTIVE", { withColor: true });
    await seedApparel(seller.id, "UNLISTED", { withColor: true });
    await seedArtwork(seller.id, "UNLISTED");
    const summary = await getSellerListingSummary(seller.id);
    expect(summary.active).toBe(1);
    expect(summary.unlisted).toBe(2);
    expect(summary.total).toBe(3);
  });
});

// ─── setApparelListingStatusAction ─────────────────────────────────────────────

describe("setApparelListingStatusAction", () => {
  beforeEach(async () => { await resetDatabase(); });
  afterEach(async () => { await resetDatabase(); vi.restoreAllMocks(); });

  async function statusOf(id: string) {
    return (await prisma.apparelListing.findUnique({ where: { id } }))?.status;
  }

  it("unlists an active listing", async () => {
    const seller = await seedSeller();
    const l = await seedApparel(seller.id, "ACTIVE");
    authAs(seller.id);
    await setApparelListingStatusAction(l.id, "UNLISTED");
    expect(await statusOf(l.id)).toBe("UNLISTED");
  });

  it("publishes an unlisted listing", async () => {
    const seller = await seedSeller();
    const l = await seedApparel(seller.id, "UNLISTED");
    authAs(seller.id);
    await setApparelListingStatusAction(l.id, "ACTIVE");
    expect(await statusOf(l.id)).toBe("ACTIVE");
  });

  it("archives from unlisted", async () => {
    const seller = await seedSeller();
    const l = await seedApparel(seller.id, "UNLISTED");
    authAs(seller.id);
    await setApparelListingStatusAction(l.id, "ARCHIVED");
    expect(await statusOf(l.id)).toBe("ARCHIVED");
  });

  it("never changes a SOLD listing", async () => {
    const seller = await seedSeller();
    const l = await seedApparel(seller.id, "SOLD");
    authAs(seller.id);
    await setApparelListingStatusAction(l.id, "UNLISTED");
    expect(await statusOf(l.id)).toBe("SOLD");
  });

  it("rejects an invalid target status", async () => {
    const seller = await seedSeller();
    const l = await seedApparel(seller.id, "ACTIVE");
    authAs(seller.id);
    await setApparelListingStatusAction(l.id, "SOLD" as never);
    expect(await statusOf(l.id)).toBe("ACTIVE");
  });

  it("does nothing for a non-owner", async () => {
    const seller = await seedSeller();
    const l = await seedApparel(seller.id, "ACTIVE");
    authAs("intruder");
    await setApparelListingStatusAction(l.id, "UNLISTED");
    expect(await statusOf(l.id)).toBe("ACTIVE");
  });

  it("does nothing for a non-seller", async () => {
    const seller = await seedSeller();
    const l = await seedApparel(seller.id, "ACTIVE");
    authAs("someone", ["BUYER"]);
    await setApparelListingStatusAction(l.id, "UNLISTED");
    expect(await statusOf(l.id)).toBe("ACTIVE");
  });
});

// ─── setListingStatusAction (artwork) ──────────────────────────────────────────

describe("setListingStatusAction (artwork)", () => {
  beforeEach(async () => { await resetDatabase(); });
  afterEach(async () => { await resetDatabase(); vi.restoreAllMocks(); });

  async function statusOf(id: string) {
    return (await prisma.originalListing.findUnique({ where: { id } }))?.status;
  }

  it("unlists then republishes an artwork listing", async () => {
    const seller = await seedSeller();
    const { listing } = await seedArtwork(seller.id, "ACTIVE");
    authAs(seller.id);
    await setListingStatusAction(listing.id, "UNLISTED");
    expect(await statusOf(listing.id)).toBe("UNLISTED");
    await setListingStatusAction(listing.id, "ACTIVE");
    expect(await statusOf(listing.id)).toBe("ACTIVE");
  });

  it("does not change a SOLD listing", async () => {
    const seller = await seedSeller();
    const { listing } = await seedArtwork(seller.id, "SOLD");
    authAs(seller.id);
    await setListingStatusAction(listing.id, "UNLISTED");
    expect(await statusOf(listing.id)).toBe("SOLD");
  });

  it("does not change a listing whose auction has bids", async () => {
    const seller = await seedSeller();
    const { listing } = await seedArtwork(seller.id, "ACTIVE");
    await prisma.auction.create({
      data: { originalListingId: listing.id, startBid: 100, bidCount: 2, endAt: new Date(Date.now() + 86400000), status: "ACTIVE" },
    });
    authAs(seller.id);
    await setListingStatusAction(listing.id, "UNLISTED");
    expect(await statusOf(listing.id)).toBe("ACTIVE");
  });

  it("does nothing for a non-owner", async () => {
    const seller = await seedSeller();
    const { listing } = await seedArtwork(seller.id, "ACTIVE");
    authAs("intruder");
    await setListingStatusAction(listing.id, "UNLISTED");
    expect(await statusOf(listing.id)).toBe("ACTIVE");
  });
});
