import { prisma } from "@/lib/db";

interface BidHistoryEntry {
  amount: number;
  placedAt: Date;
}

export interface AuctionStatusResult {
  auctionId: string;
  status: string;
  startBid: number;
  currentBid: number | null;
  bidCount: number;
  timeRemainingMs: number;
  bidHistory: BidHistoryEntry[];
}

export async function getAuctionStatus(auctionId: string): Promise<AuctionStatusResult> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      bids: {
        orderBy: { placedAt: "desc" },
        select: { amount: true, placedAt: true },
      },
    },
  });

  if (!auction) throw new Error(`Auction not found: ${auctionId}`);

  const timeRemainingMs = Math.max(0, auction.endAt.getTime() - Date.now());

  return {
    auctionId: auction.id,
    status: auction.status,
    startBid: Number(auction.startBid),
    currentBid: auction.currentBid ? Number(auction.currentBid) : null,
    bidCount: auction.bidCount,
    timeRemainingMs,
    bidHistory: auction.bids.map((b) => ({
      amount: Number(b.amount),
      placedAt: b.placedAt,
    })),
  };
}
