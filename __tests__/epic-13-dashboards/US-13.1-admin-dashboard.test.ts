import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase, prisma } from "../helpers/db";
import {
  computeTrackerSummary,
  getAdminSiteMetrics,
  getAdminRecentActivity,
} from "@/lib/dashboard/admin";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedUsers() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.com", name: "Admin", passwordHash: "x", roles: ["ADMIN", "BUYER"] },
  });
  const seller = await prisma.user.create({
    data: { email: "seller@test.com", name: "Seller", passwordHash: "x", roles: ["SELLER", "BUYER"] },
  });
  const buyer1 = await prisma.user.create({
    data: { email: "buyer1@test.com", name: "Buyer 1", passwordHash: "x", roles: ["BUYER"] },
  });
  const buyer2 = await prisma.user.create({
    data: { email: "buyer2@test.com", name: "Buyer 2", passwordHash: "x", roles: ["BUYER"] },
  });
  return { admin, seller, buyer1, buyer2 };
}

async function seedListings(sellerId: string) {
  const artwork1 = await prisma.artwork.create({
    data: { title: "Active Art", description: "", sellerId, status: "PUBLISHED" },
  });
  const artwork2 = await prisma.artwork.create({
    data: { title: "Sold Art", description: "", sellerId, status: "PUBLISHED" },
  });
  const artwork3 = await prisma.artwork.create({
    data: { title: "Archived Art", description: "", sellerId, status: "PUBLISHED" },
  });

  const activeListing = await prisma.originalListing.create({
    data: { artworkId: artwork1.id, saleType: "FIXED_PRICE", price: 500, status: "ACTIVE" },
  });
  const soldListing = await prisma.originalListing.create({
    data: { artworkId: artwork2.id, saleType: "FIXED_PRICE", price: 1000, status: "SOLD" },
  });
  const archivedListing = await prisma.originalListing.create({
    data: { artworkId: artwork3.id, saleType: "FIXED_PRICE", price: 200, status: "ARCHIVED" },
  });

  return { artwork1, artwork2, artwork3, activeListing, soldListing, archivedListing };
}

// ─── Minimal tracker fixture ──────────────────────────────────────────────────

const sampleTrackerData = {
  stories: [
    { id: "US-1.1", epic: "Epic 1", title: "Create Listing", status: "Passed", notes: null },
    { id: "US-1.2", epic: "Epic 1", title: "Upload Images", status: "Passed", notes: null },
    { id: "US-2.1", epic: "Epic 2", title: "Set Price", status: "Test Written", notes: null },
    { id: "US-3.1", epic: "Epic 3", title: "Configure Auction", status: "Not Started", notes: null },
    { id: "US-3.2", epic: "Epic 3", title: "Place Bid", status: "Not Started", notes: null },
    { id: "US-4.1", epic: "Epic 4", title: "Pay by Card", status: "Deferred", notes: "Deferred reason" },
  ],
  commits: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-13.1 — Admin Dashboard", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  // ── computeTrackerSummary (pure) ────────────────────────────────────────────

  describe("Unit: computeTrackerSummary", () => {
    it("computes overall totals and counts by status", () => {
      const summary = computeTrackerSummary(sampleTrackerData as never);
      expect(summary.totalStories).toBe(6);
      expect(summary.byStatus.Passed).toBe(2);
      expect(summary.byStatus["Test Written"]).toBe(1);
      expect(summary.byStatus["Not Started"]).toBe(2);
      expect(summary.byStatus.Deferred).toBe(1);
    });

    it("computes percentage for Passed stories", () => {
      const summary = computeTrackerSummary(sampleTrackerData as never);
      expect(summary.passedPercent).toBeCloseTo(33.33, 1);
    });

    it("groups stories by epic with per-epic progress", () => {
      const summary = computeTrackerSummary(sampleTrackerData as never);
      const epic1 = summary.byEpic.find((e) => e.epic === "Epic 1");
      expect(epic1).toBeDefined();
      expect(epic1!.total).toBe(2);
      expect(epic1!.passed).toBe(2);

      const epic3 = summary.byEpic.find((e) => e.epic === "Epic 3");
      expect(epic3!.total).toBe(2);
      expect(epic3!.passed).toBe(0);
    });

    it("returns list of stories with Not Started or In Progress status", () => {
      const summary = computeTrackerSummary(sampleTrackerData as never);
      const pending = summary.pendingStories;
      expect(pending.length).toBe(2);
      expect(pending.every((s) => s.status === "Not Started" || s.status === "In Progress")).toBe(true);
    });

    it("handles empty stories array without throwing", () => {
      const summary = computeTrackerSummary({ stories: [], commits: [] } as never);
      expect(summary.totalStories).toBe(0);
      expect(summary.passedPercent).toBe(0);
      expect(summary.byEpic).toHaveLength(0);
      expect(summary.pendingStories).toHaveLength(0);
    });
  });

  // ── getAdminSiteMetrics (integration) ──────────────────────────────────────

  describe("Integration: getAdminSiteMetrics", () => {
    it("counts listings by status", async () => {
      const { seller } = await seedUsers();
      await seedListings(seller.id);

      const metrics = await getAdminSiteMetrics();
      expect(metrics.listings.active).toBe(1);
      expect(metrics.listings.sold).toBe(1);
      expect(metrics.listings.archived).toBe(1);
      expect(metrics.listings.total).toBe(3);
    });

    it("counts users by role", async () => {
      await seedUsers();

      const metrics = await getAdminSiteMetrics();
      // admin has ADMIN + BUYER, seller has SELLER + BUYER, buyer1 and buyer2 are BUYER only
      expect(metrics.users.admins).toBe(1);
      expect(metrics.users.sellers).toBe(1);
      expect(metrics.users.buyers).toBe(4); // all 4 users have BUYER role
      expect(metrics.users.total).toBe(4);
    });

    it("returns zero counts when database is empty", async () => {
      const metrics = await getAdminSiteMetrics();
      expect(metrics.listings.total).toBe(0);
      expect(metrics.users.total).toBe(0);
    });
  });

  // ── getAdminRecentActivity (integration) ───────────────────────────────────

  describe("Integration: getAdminRecentActivity", () => {
    it("returns at most 10 recent events", async () => {
      const { seller, buyer1 } = await seedUsers();

      // Create 5 artworks (new listing events)
      for (let i = 0; i < 5; i++) {
        const art = await prisma.artwork.create({
          data: { title: `Art ${i}`, description: "", sellerId: seller.id, status: "PUBLISHED" },
        });
        await prisma.originalListing.create({
          data: { artworkId: art.id, saleType: "FIXED_PRICE", price: 100, status: "ACTIVE" },
        });
      }

      // Create 5 bids
      const art = await prisma.artwork.create({
        data: { title: "Auction Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
      });
      const listing = await prisma.originalListing.create({
        data: { artworkId: art.id, saleType: "AUCTION", price: 100, status: "ACTIVE" },
      });
      const auction = await prisma.auction.create({
        data: { originalListingId: listing.id, startBid: 100, endAt: new Date(Date.now() + 86400000), status: "ACTIVE" },
      });
      for (let i = 0; i < 5; i++) {
        await prisma.bid.create({
          data: { auctionId: auction.id, bidderId: buyer1.id, amount: 100 + i * 10 },
        });
      }

      const activity = await getAdminRecentActivity();
      expect(activity.length).toBeLessThanOrEqual(10);
    });

    it("includes new listing events in the activity feed", async () => {
      const { seller } = await seedUsers();
      const art = await prisma.artwork.create({
        data: { title: "Brand New Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
      });
      await prisma.originalListing.create({
        data: { artworkId: art.id, saleType: "FIXED_PRICE", price: 500, status: "ACTIVE" },
      });

      const activity = await getAdminRecentActivity();
      const listingEvent = activity.find((a) => a.type === "new_listing");
      expect(listingEvent).toBeDefined();
      expect(listingEvent!.description).toContain("Brand New Art");
    });

    it("includes bid events in the activity feed", async () => {
      const { seller, buyer1 } = await seedUsers();
      const art = await prisma.artwork.create({
        data: { title: "Bid Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
      });
      const listing = await prisma.originalListing.create({
        data: { artworkId: art.id, saleType: "AUCTION", price: 100, status: "ACTIVE" },
      });
      const auction = await prisma.auction.create({
        data: { originalListingId: listing.id, startBid: 100, endAt: new Date(Date.now() + 86400000), status: "ACTIVE" },
      });
      await prisma.bid.create({
        data: { auctionId: auction.id, bidderId: buyer1.id, amount: 150 },
      });

      const activity = await getAdminRecentActivity();
      const bidEvent = activity.find((a) => a.type === "bid_placed");
      expect(bidEvent).toBeDefined();
    });

    it("includes purchase events in the activity feed", async () => {
      const { seller, buyer1 } = await seedUsers();
      const art = await prisma.artwork.create({
        data: { title: "Purchased Art", description: "", sellerId: seller.id, status: "PUBLISHED" },
      });
      const listing = await prisma.originalListing.create({
        data: { artworkId: art.id, saleType: "FIXED_PRICE", price: 500, status: "SOLD" },
      });
      await prisma.order.create({
        data: {
          buyerId: buyer1.id,
          listingType: "ORIGINAL",
          originalListingId: listing.id,
          subtotal: 500,
          taxAmount: 0,
          totalAmount: 500,
          status: "PAID",
        },
      });

      const activity = await getAdminRecentActivity();
      const purchaseEvent = activity.find((a) => a.type === "purchase_completed");
      expect(purchaseEvent).toBeDefined();
    });

    it("returns events sorted by date descending (newest first)", async () => {
      const { seller, buyer1 } = await seedUsers();
      const art = await prisma.artwork.create({
        data: { title: "Art A", description: "", sellerId: seller.id, status: "PUBLISHED" },
      });
      const listing = await prisma.originalListing.create({
        data: { artworkId: art.id, saleType: "FIXED_PRICE", price: 200, status: "ACTIVE" },
      });
      const art2 = await prisma.artwork.create({
        data: { title: "Art B", description: "", sellerId: seller.id, status: "PUBLISHED" },
      });
      await prisma.originalListing.create({
        data: { artworkId: art2.id, saleType: "FIXED_PRICE", price: 300, status: "SOLD" },
      });
      await prisma.order.create({
        data: {
          buyerId: buyer1.id,
          listingType: "ORIGINAL",
          originalListingId: listing.id,
          subtotal: 200,
          taxAmount: 0,
          totalAmount: 200,
          status: "PAID",
        },
      });

      const activity = await getAdminRecentActivity();
      for (let i = 1; i < activity.length; i++) {
        expect(new Date(activity[i - 1].date) >= new Date(activity[i].date)).toBe(true);
      }
    });

    it("returns empty array when there is no activity", async () => {
      const activity = await getAdminRecentActivity();
      expect(activity).toHaveLength(0);
    });
  });
});
