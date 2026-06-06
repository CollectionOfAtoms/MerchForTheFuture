import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDatabase, prisma } from "../helpers/db";
import {
  getBuyerActiveBids,
  getBuyerTopBids,
  getBuyerOrderHistory,
} from "@/lib/dashboard/buyer";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedUser(email: string, roles: string[] = ["BUYER"]) {
  return prisma.user.create({
    data: { email, name: email.split("@")[0], passwordHash: "x", roles: roles as never },
  });
}

async function createAuction(
  sellerId: string,
  opts: {
    title?: string;
    status?: "SCHEDULED" | "ACTIVE" | "CLOSED" | "CANCELLED";
    endOffset?: number;
    currentBidderId?: string | null;
    currentBid?: number | null;
  } = {}
) {
  const {
    title = "Auction Art",
    status = "ACTIVE",
    endOffset = 86400000,
    currentBidderId = null,
    currentBid = null,
  } = opts;

  const artwork = await prisma.artwork.create({
    data: { title, description: "", sellerId, status: "PUBLISHED" },
  });
  const listing = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "AUCTION", price: 100, status: "ACTIVE" },
  });
  const auction = await prisma.auction.create({
    data: {
      originalListingId: listing.id,
      startBid: 100,
      currentBid,
      currentBidderId,
      endAt: new Date(Date.now() + endOffset),
      status,
    },
  });
  return { artwork, listing, auction };
}

async function placeBid(auctionId: string, bidderId: string, amount: number) {
  return prisma.bid.create({
    data: { auctionId, bidderId, amount },
  });
}

async function createCompletedOrder(
  buyerId: string,
  sellerId: string,
  opts: { title?: string; amount?: number; status?: string } = {}
) {
  const { title = "Purchased Art", amount = 500, status = "PAID" } = opts;
  const artwork = await prisma.artwork.create({
    data: { title, description: "", sellerId, status: "PUBLISHED" },
  });
  const listing = await prisma.originalListing.create({
    data: { artworkId: artwork.id, saleType: "FIXED_PRICE", price: amount, status: "SOLD" },
  });
  return prisma.order.create({
    data: {
      buyerId,
      listingType: "ORIGINAL",
      originalListingId: listing.id,
      subtotal: amount,
      taxAmount: 0,
      totalAmount: amount,
      status: status as never,
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-13.3 — Buyer Dashboard", () => {
  beforeEach(() => resetDatabase());
  afterEach(() => resetDatabase());

  // ── getBuyerActiveBids ───────────────────────────────────────────────────────

  describe("Integration: getBuyerActiveBids", () => {
    it("returns empty array for buyer with no bids", async () => {
      const buyer = await seedUser("buyer@test.com");
      const bids = await getBuyerActiveBids(buyer.id);
      expect(bids).toHaveLength(0);
    });

    it("returns auctions the buyer has bid on (active auctions only)", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer = await seedUser("buyer@test.com");
      const { auction: activeAuction } = await createAuction(seller.id, {
        title: "Active Auction",
        status: "ACTIVE",
        currentBidderId: buyer.id,
        currentBid: 150,
      });
      const { auction: closedAuction } = await createAuction(seller.id, {
        title: "Closed Auction",
        status: "CLOSED",
      });
      await placeBid(activeAuction.id, buyer.id, 150);
      await placeBid(closedAuction.id, buyer.id, 120);

      const bids = await getBuyerActiveBids(buyer.id);
      expect(bids).toHaveLength(1);
      expect(bids[0].artwork.title).toBe("Active Auction");
    });

    it("marks buyer as winning when they are the currentBidderId", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer = await seedUser("buyer@test.com");
      const { auction } = await createAuction(seller.id, {
        currentBidderId: buyer.id,
        currentBid: 200,
      });
      await placeBid(auction.id, buyer.id, 200);

      const bids = await getBuyerActiveBids(buyer.id);
      expect(bids[0].isWinning).toBe(true);
    });

    it("marks buyer as outbid when another bidder is currentBidderId", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer = await seedUser("buyer@test.com");
      const other = await seedUser("other@test.com");
      const { auction } = await createAuction(seller.id, {
        currentBidderId: other.id,
        currentBid: 250,
      });
      await placeBid(auction.id, buyer.id, 150);
      await placeBid(auction.id, other.id, 250);

      const bids = await getBuyerActiveBids(buyer.id);
      expect(bids[0].isWinning).toBe(false);
    });

    it("returns the buyer's highest bid amount for each auction", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer = await seedUser("buyer@test.com");
      const { auction } = await createAuction(seller.id, {
        currentBidderId: buyer.id,
        currentBid: 300,
      });
      await placeBid(auction.id, buyer.id, 200);
      await placeBid(auction.id, buyer.id, 300);

      const bids = await getBuyerActiveBids(buyer.id);
      expect(Number(bids[0].myHighestBid)).toBe(300);
    });

    it("does not return bids from other buyers", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer1 = await seedUser("buyer1@test.com");
      const buyer2 = await seedUser("buyer2@test.com");
      const { auction } = await createAuction(seller.id, {
        currentBidderId: buyer2.id,
        currentBid: 200,
      });
      await placeBid(auction.id, buyer2.id, 200);

      const bids = await getBuyerActiveBids(buyer1.id);
      expect(bids).toHaveLength(0);
    });

    it("includes artwork title and auction end time", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer = await seedUser("buyer@test.com");
      const { auction } = await createAuction(seller.id, {
        title: "My Auction Piece",
        currentBidderId: buyer.id,
        currentBid: 150,
      });
      await placeBid(auction.id, buyer.id, 150);

      const bids = await getBuyerActiveBids(buyer.id);
      expect(bids[0].artwork.title).toBe("My Auction Piece");
      expect(bids[0].endAt).toBeInstanceOf(Date);
    });
  });

  // ── getBuyerTopBids ──────────────────────────────────────────────────────────

  describe("Integration: getBuyerTopBids", () => {
    it("returns empty array when buyer is not winning any auctions", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer = await seedUser("buyer@test.com");
      const other = await seedUser("other@test.com");
      const { auction } = await createAuction(seller.id, {
        currentBidderId: other.id,
        currentBid: 300,
      });
      await placeBid(auction.id, buyer.id, 150);
      await placeBid(auction.id, other.id, 300);

      const topBids = await getBuyerTopBids(buyer.id);
      expect(topBids).toHaveLength(0);
    });

    it("returns only auctions where buyer is the current highest bidder", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer = await seedUser("buyer@test.com");
      const other = await seedUser("other@test.com");

      const { auction: winning } = await createAuction(seller.id, {
        title: "Winning Auction",
        currentBidderId: buyer.id,
        currentBid: 200,
      });
      const { auction: losing } = await createAuction(seller.id, {
        title: "Losing Auction",
        currentBidderId: other.id,
        currentBid: 300,
      });
      await placeBid(winning.id, buyer.id, 200);
      await placeBid(losing.id, buyer.id, 150);
      await placeBid(losing.id, other.id, 300);

      const topBids = await getBuyerTopBids(buyer.id);
      expect(topBids).toHaveLength(1);
      expect(topBids[0].artwork.title).toBe("Winning Auction");
    });
  });

  // ── getBuyerOrderHistory ─────────────────────────────────────────────────────

  describe("Integration: getBuyerOrderHistory", () => {
    it("returns empty array for buyer with no orders", async () => {
      const buyer = await seedUser("buyer@test.com");
      const orders = await getBuyerOrderHistory(buyer.id);
      expect(orders).toHaveLength(0);
    });

    it("returns completed orders for the buyer", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer = await seedUser("buyer@test.com");
      await createCompletedOrder(buyer.id, seller.id, { title: "My Purchase", amount: 750 });

      const orders = await getBuyerOrderHistory(buyer.id);
      expect(orders).toHaveLength(1);
      expect(orders[0].artwork?.title).toBe("My Purchase");
    });

    it("includes purchase amount, date, and order status", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer = await seedUser("buyer@test.com");
      await createCompletedOrder(buyer.id, seller.id, { amount: 1200, status: "SHIPPED" });

      const orders = await getBuyerOrderHistory(buyer.id);
      expect(Number(orders[0].totalAmount)).toBe(1200);
      expect(orders[0].status).toBe("SHIPPED");
      expect(orders[0].createdAt).toBeInstanceOf(Date);
    });

    it("does not return orders from other buyers", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer1 = await seedUser("buyer1@test.com");
      const buyer2 = await seedUser("buyer2@test.com");
      await createCompletedOrder(buyer2.id, seller.id, { title: "Other Buyer's Art" });

      const orders = await getBuyerOrderHistory(buyer1.id);
      expect(orders).toHaveLength(0);
    });

    it("returns orders sorted by date descending", async () => {
      const seller = await seedUser("seller@test.com", ["SELLER", "BUYER"]);
      const buyer = await seedUser("buyer@test.com");
      await createCompletedOrder(buyer.id, seller.id, { title: "First" });
      await createCompletedOrder(buyer.id, seller.id, { title: "Second" });

      const orders = await getBuyerOrderHistory(buyer.id);
      expect(orders).toHaveLength(2);
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i - 1].createdAt >= orders[i].createdAt).toBe(true);
      }
    });
  });
});
