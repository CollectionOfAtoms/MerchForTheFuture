import { prisma } from "@/lib/db";

// Prisma Decimal is compatible with Number() — no import from generated code needed
type Decimal = { toString(): string; toNumber(): number };

// ─── All bids (for My Bids page — includes closed/won/lost auctions) ──────────

export type BidStatus = "winning" | "outbid" | "won" | "lost";

export interface BuyerBid {
  auctionId: string;
  artworkId: string;
  listingId: string;
  artwork: { title: string; images: { url: string }[] };
  myHighestBid: Decimal;
  currentBid: Decimal | null;
  bidStatus: BidStatus;
  auctionStatus: string;
  endAt: Date;
}

export async function getBuyerAllBids(userId: string): Promise<BuyerBid[]> {
  const bidGroups = await prisma.bid.groupBy({
    by: ["auctionId"],
    where: { bidderId: userId },
    _max: { amount: true },
  });

  if (bidGroups.length === 0) return [];

  const auctionIds = bidGroups.map((b) => b.auctionId);
  const bidMaxByAuction = new Map(bidGroups.map((b) => [b.auctionId, b._max.amount]));

  const auctions = await prisma.auction.findMany({
    where: { id: { in: auctionIds } },
    include: {
      originalListing: {
        include: {
          artwork: {
            select: {
              id: true,
              title: true,
              images: { where: { isPrimary: true }, take: 1, select: { url: true } },
            },
          },
        },
      },
    },
    orderBy: { endAt: "desc" },
  });

  return auctions.map((auction) => {
    const isActive = auction.status === "ACTIVE";
    const isWinning = auction.currentBidderId === userId;
    let bidStatus: BidStatus;
    if (isActive) {
      bidStatus = isWinning ? "winning" : "outbid";
    } else {
      bidStatus = isWinning ? "won" : "lost";
    }
    return {
      auctionId: auction.id,
      artworkId: auction.originalListing.artwork.id,
      listingId: auction.originalListingId,
      artwork: {
        title: auction.originalListing.artwork.title,
        images: auction.originalListing.artwork.images,
      },
      myHighestBid: bidMaxByAuction.get(auction.id) ?? (0 as unknown as Decimal),
      currentBid: auction.currentBid,
      bidStatus,
      auctionStatus: auction.status,
      endAt: auction.endAt,
    };
  });
}

// ─── Active bids ──────────────────────────────────────────────────────────────

export interface BuyerActiveBid {
  auctionId: string;
  artworkId: string;
  listingId: string;
  artwork: { title: string; images: { url: string }[] };
  myHighestBid: Decimal;
  currentBid: Decimal | null;
  isWinning: boolean;
  endAt: Date;
}

export async function getBuyerActiveBids(userId: string): Promise<BuyerActiveBid[]> {
  // Find all auctions that are ACTIVE where this buyer has placed at least one bid
  const bidGroups = await prisma.bid.groupBy({
    by: ["auctionId"],
    where: { bidderId: userId },
    _max: { amount: true },
  });

  if (bidGroups.length === 0) return [];

  const auctionIds = bidGroups.map((b) => b.auctionId);
  const bidMaxByAuction = new Map(bidGroups.map((b) => [b.auctionId, b._max.amount]));

  const auctions = await prisma.auction.findMany({
    where: { id: { in: auctionIds }, status: "ACTIVE" },
    include: {
      originalListing: {
        include: {
          artwork: {
            select: {
              id: true,
              title: true,
              images: { where: { isPrimary: true }, take: 1, select: { url: true } },
            },
          },
        },
      },
    },
  });

  return auctions.map((auction) => ({
    auctionId: auction.id,
    artworkId: auction.originalListing.artwork.id,
    listingId: auction.originalListingId,
    artwork: auction.originalListing.artwork,
    myHighestBid: bidMaxByAuction.get(auction.id) ?? (0 as unknown as Decimal),
    currentBid: auction.currentBid,
    isWinning: auction.currentBidderId === userId,
    endAt: auction.endAt,
  }));
}

// ─── Top bids (auctions where buyer is winning) ────────────────────────────────

export async function getBuyerTopBids(userId: string): Promise<BuyerActiveBid[]> {
  const allBids = await getBuyerActiveBids(userId);
  return allBids.filter((b) => b.isWinning);
}

// ─── Order history ────────────────────────────────────────────────────────────

export interface BuyerOrder {
  id: string;
  artwork: { title: string; images: { url: string }[] } | null;
  totalAmount: Decimal;
  status: string;
  createdAt: Date;
}

export async function getBuyerOrderHistory(userId: string): Promise<BuyerOrder[]> {
  const orders = await prisma.order.findMany({
    where: { buyerId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      originalListing: {
        include: {
          artwork: {
            select: {
              title: true,
              images: { where: { isPrimary: true }, take: 1, select: { url: true } },
            },
          },
        },
      },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    artwork: order.originalListing?.artwork ?? null,
    totalAmount: order.totalAmount,
    status: order.status,
    createdAt: order.createdAt,
  }));
}
