import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase, prisma } from "../helpers/db";
import {
  getSellerListingSummary,
  getSellerActiveListings,
  getSellerRecentActivity,
  getSellerRevenue,
} from "@/lib/dashboard/seller";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSeller(email = "seller@test.com") {
  return prisma.user.create({
    data: { email, name: "Seller", passwordHash: "x", roles: ["SELLER", "BUYER"] },
  });
}

async function seedBuyer(email = "buyer@test.com") {
  return prisma.user.create({
    data: { email, name: "Buyer", passwordHash: "x", roles: ["BUYER"] },
  });
}

async function createListing(
  sellerId: string,
  opts: {
    title?: string;
    status?: "ACTIVE" | "SOLD" | "ARCHIVED" | "RESERVE_NOT_MET" | "CANCELLED";
    saleType?: "FIXED_PRICE" | "AUCTION";
    price?: number;
    withAuction?: boolean;
    auctionEndOffset?: number;
  } = {}
) {
  const {
    title = "Test Art",
    status = "ACTIVE",
    saleType = "FIXED_PRICE",
    price = 500,
    withAuction = false,
    auctionEndOffset = 86400000,
  } = opts;

  const artwork = await prisma.artwork.create({
    data: { title, description: "", sellerId, status: "PUBLISHED" },
  });
  const listing = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType, price, status },
  });
  let auction = null;
  if (withAuction || saleType === "AUCTION") {
    auction = await prisma.auction.create({
      data: {
        originalListingId: listing.id,
        startBid: price,
        endAt: new Date(Date.now() + auctionEndOffset),
        status: status === "ACTIVE" ? "ACTIVE" : "CLOSED",
      },
    });
  }
  return { artwork, listing, auction };
}

async function createOrder(
  buyerId: string,
  listingId: string,
  amount: number,
  netPayout: number
) {
  const order = await prisma.order.create({
    data: {
      buyerId,
      listingType: "ORIGINAL",
      originalListingId: listingId,
      subtotal: amount,
      taxAmount: 0,
      totalAmount: amount,
      status: "PAID",
    },
  });
  await prisma.transaction.create({
    data: {
      orderId: order.id,
      grossAmount: amount,
      platformFee: amount * 0.1,
      processingFee: amount * 0.029,
      netPayout,
    },
  });
  return order;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-13.2 — Seller Dashboard", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  // ── getSellerListingSummary ──────────────────────────────────────────────────

  describe("Integration: getSellerListingSummary", () => {
    it("returns zero counts for a seller with no listings", async () => {
      const seller = await seedSeller();
      const summary = await getSellerListingSummary(seller.id);
      expect(summary.active).toBe(0);
      expect(summary.sold).toBe(0);
      expect(summary.archived).toBe(0);
      expect(summary.total).toBe(0);
    });

    it("counts listings correctly by status", async () => {
      const seller = await seedSeller();
      await createListing(seller.id, { title: "Active 1", status: "ACTIVE" });
      await createListing(seller.id, { title: "Active 2", status: "ACTIVE" });
      await createListing(seller.id, { title: "Sold", status: "SOLD" });
      await createListing(seller.id, { title: "Archived", status: "ARCHIVED" });

      const summary = await getSellerListingSummary(seller.id);
      expect(summary.active).toBe(2);
      expect(summary.sold).toBe(1);
      expect(summary.archived).toBe(1);
      expect(summary.total).toBe(4);
    });

    it("only counts listings belonging to the given seller", async () => {
      const seller1 = await seedSeller("seller1@test.com");
      const seller2 = await seedSeller("seller2@test.com");
      await createListing(seller1.id, { status: "ACTIVE" });
      await createListing(seller2.id, { status: "ACTIVE" });
      await createListing(seller2.id, { status: "SOLD" });

      const summary = await getSellerListingSummary(seller1.id);
      expect(summary.active).toBe(1);
      expect(summary.total).toBe(1);
    });
  });

  // ── getSellerActiveListings ──────────────────────────────────────────────────

  describe("Integration: getSellerActiveListings", () => {
    // Active listings are now the unified SellerListingRow shape (artwork +
    // apparel, both sourcing modes), filtered to ACTIVE.
    async function createDesignedApparel(sellerId: string, title: string, status: "ACTIVE" | "ARCHIVED" | "SOLD" = "ACTIVE") {
      const pt = await prisma.productType.create({
        data: { name: `Tee ${crypto.randomUUID()}`, fulfillmentProvider: "PRODIGI", providerSkuBase: "RNA1" },
      });
      return prisma.apparelListing.create({
        data: { sellerId, sourcingMode: "DESIGNED", productTypeId: pt.id, title, retailPrice: 28, status, designImageUrl: "https://blob/d.png" },
      });
    }
    async function createReferencedApparel(sellerId: string, title: string, status: "ACTIVE" | "ARCHIVED" | "SOLD" = "ACTIVE") {
      return prisma.apparelListing.create({
        data: { sellerId, sourcingMode: "REFERENCED", title, retailPrice: 32, status, providerKey: "teemill", providerProductRef: `ref-${crypto.randomUUID()}` },
      });
    }

    it("returns empty array when seller has no active listings", async () => {
      const seller = await seedSeller();
      const listings = await getSellerActiveListings(seller.id);
      expect(listings).toHaveLength(0);
    });

    it("returns only ACTIVE listings for the seller", async () => {
      const seller = await seedSeller();
      await createListing(seller.id, { title: "Active", status: "ACTIVE" });
      await createListing(seller.id, { title: "Sold", status: "SOLD" });
      await createListing(seller.id, { title: "Archived", status: "ARCHIVED" });

      const listings = await getSellerActiveListings(seller.id);
      expect(listings).toHaveLength(1);
      expect(listings[0].title).toBe("Active");
    });

    it("includes artwork title and price for each active artwork listing", async () => {
      const seller = await seedSeller();
      await createListing(seller.id, { title: "My Painting", price: 750, status: "ACTIVE" });

      const listings = await getSellerActiveListings(seller.id);
      const art = listings.find((l) => l.kind === "ARTWORK");
      expect(art).toBeDefined();
      expect(art!.title).toBe("My Painting");
      expect(art!.kind === "ARTWORK" && art!.price).toBe(750);
    });

    it("includes auction end time for auction listings", async () => {
      const seller = await seedSeller();
      await createListing(seller.id, {
        title: "Auction Piece",
        saleType: "AUCTION",
        status: "ACTIVE",
        withAuction: true,
        auctionEndOffset: 48 * 3600 * 1000,
      });

      const [row] = await getSellerActiveListings(seller.id);
      expect(row.kind).toBe("ARTWORK");
      expect(row.kind === "ARTWORK" && row.auctionEndAt).toBeInstanceOf(Date);
    });

    it("includes active designed and referenced apparel listings alongside artwork", async () => {
      const seller = await seedSeller();
      await createListing(seller.id, { title: "A Painting", status: "ACTIVE" });
      await createDesignedApparel(seller.id, "Designed Tee", "ACTIVE");
      await createReferencedApparel(seller.id, "Referenced Tee", "ACTIVE");
      await createDesignedApparel(seller.id, "Archived Tee", "ARCHIVED");

      const listings = await getSellerActiveListings(seller.id);
      expect(listings.map((l) => l.title).sort()).toEqual(["A Painting", "Designed Tee", "Referenced Tee"]);
      const apparel = listings.filter((l) => l.kind === "APPAREL");
      expect(apparel).toHaveLength(2);
      expect(apparel.every((l) => l.kind === "APPAREL" && l.retailPrice > 0)).toBe(true);
    });

    it("does not return listings from other sellers", async () => {
      const seller1 = await seedSeller("seller1@test.com");
      const seller2 = await seedSeller("seller2@test.com");
      await createListing(seller1.id, { title: "Seller1 Art", status: "ACTIVE" });
      await createReferencedApparel(seller2.id, "Seller2 Tee", "ACTIVE");
      await createListing(seller2.id, { title: "Seller2 Art", status: "ACTIVE" });

      const listings = await getSellerActiveListings(seller1.id);
      expect(listings).toHaveLength(1);
      expect(listings[0].title).toBe("Seller1 Art");
    });
  });

  // ── getSellerRecentActivity ──────────────────────────────────────────────────

  describe("Integration: getSellerRecentActivity", () => {
    it("returns empty array for seller with no activity", async () => {
      const seller = await seedSeller();
      const activity = await getSellerRecentActivity(seller.id);
      expect(activity).toHaveLength(0);
    });

    it("includes bid events on seller's auction listings", async () => {
      const seller = await seedSeller();
      const buyer = await seedBuyer();
      const { listing, auction } = await createListing(seller.id, {
        title: "Auction Art",
        saleType: "AUCTION",
        withAuction: true,
      });

      await prisma.bid.create({
        data: { auctionId: auction!.id, bidderId: buyer.id, amount: 600 },
      });

      const activity = await getSellerRecentActivity(seller.id);
      const bidEvent = activity.find((a) => a.type === "bid_received");
      expect(bidEvent).toBeDefined();
      expect(bidEvent!.description).toContain("Auction Art");
    });

    it("includes purchase events on seller's listings", async () => {
      const seller = await seedSeller();
      const buyer = await seedBuyer();
      const { listing } = await createListing(seller.id, { title: "Sold Piece", status: "SOLD" });
      await createOrder(buyer.id, listing.id, 500, 435);

      const activity = await getSellerRecentActivity(seller.id);
      const purchaseEvent = activity.find((a) => a.type === "purchase_completed");
      expect(purchaseEvent).toBeDefined();
    });

    it("includes auctions ending within 24 hours", async () => {
      const seller = await seedSeller();
      await createListing(seller.id, {
        title: "Ending Soon",
        saleType: "AUCTION",
        withAuction: true,
        auctionEndOffset: 12 * 3600 * 1000, // 12 hours
      });

      const activity = await getSellerRecentActivity(seller.id);
      const endingSoonEvent = activity.find((a) => a.type === "auction_ending_soon");
      expect(endingSoonEvent).toBeDefined();
      expect(endingSoonEvent!.description).toContain("Ending Soon");
    });

    it("does not include activity from other sellers' listings", async () => {
      const seller1 = await seedSeller("seller1@test.com");
      const seller2 = await seedSeller("seller2@test.com");
      const buyer = await seedBuyer();
      const { listing } = await createListing(seller2.id, { title: "Other Art", status: "SOLD" });
      await createOrder(buyer.id, listing.id, 500, 435);

      const activity = await getSellerRecentActivity(seller1.id);
      expect(activity).toHaveLength(0);
    });

    it("returns activity sorted by date descending", async () => {
      const seller = await seedSeller();
      const buyer = await seedBuyer();
      const { listing: l1 } = await createListing(seller.id, { title: "Art 1", status: "SOLD" });
      const { listing: l2 } = await createListing(seller.id, { title: "Art 2", status: "SOLD" });
      await createOrder(buyer.id, l1.id, 300, 261);
      await createOrder(buyer.id, l2.id, 400, 348);

      const activity = await getSellerRecentActivity(seller.id);
      for (let i = 1; i < activity.length; i++) {
        expect(new Date(activity[i - 1].date) >= new Date(activity[i].date)).toBe(true);
      }
    });
  });

  // ── getSellerRevenue ──────────────────────────────────────────────────────────

  describe("Integration: getSellerRevenue", () => {
    it("returns zero revenue for seller with no completed sales", async () => {
      const seller = await seedSeller();
      const revenue = await getSellerRevenue(seller.id);
      expect(revenue.originalRevenue).toBe(0);
      expect(revenue.printRevenue).toBe(0);
      expect(revenue.total).toBe(0);
    });

    it("sums netPayout from completed original listing sales", async () => {
      const seller = await seedSeller();
      const buyer = await seedBuyer();
      const { listing: l1 } = await createListing(seller.id, { status: "SOLD", price: 500 });
      const { listing: l2 } = await createListing(seller.id, { status: "SOLD", price: 1000 });
      await createOrder(buyer.id, l1.id, 500, 435);
      await createOrder(buyer.id, l2.id, 1000, 870);

      const revenue = await getSellerRevenue(seller.id);
      expect(revenue.originalRevenue).toBeCloseTo(1305, 0);
      expect(revenue.total).toBeCloseTo(1305, 0);
    });

    it("does not include revenue from other sellers", async () => {
      const seller1 = await seedSeller("seller1@test.com");
      const seller2 = await seedSeller("seller2@test.com");
      const buyer = await seedBuyer();
      const { listing } = await createListing(seller2.id, { status: "SOLD", price: 1000 });
      await createOrder(buyer.id, listing.id, 1000, 870);

      const revenue = await getSellerRevenue(seller1.id);
      expect(revenue.originalRevenue).toBe(0);
    });
  });
});
