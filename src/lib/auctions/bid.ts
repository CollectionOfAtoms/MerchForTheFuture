import { prisma } from "@/lib/db";
import { Bid } from "@/generated/prisma/client";

interface PlaceBidInput {
  auctionId: string;
  bidderId: string;
  amount: number;
}

export async function placeBid(input: PlaceBidInput): Promise<Bid> {
  const { auctionId, bidderId, amount } = input;

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new Error("Auction not found.");
  if (auction.status !== "ACTIVE" && auction.status !== "SCHEDULED") throw new Error("Auction is not active — bidding is closed.");
  if (auction.endAt <= new Date()) throw new Error("Auction has ended — bidding is closed.");

  const currentHigh = auction.currentBid ? Number(auction.currentBid) : null;
  const startBid = Number(auction.startBid);

  if (amount <= startBid - 1 && currentHigh === null) {
    throw new Error(`Bid must meet or exceed the start bid of ${startBid}.`);
  }
  if (currentHigh !== null && amount <= currentHigh) {
    throw new Error(`Bid must exceed the current highest bid. Place a bid higher than ${currentHigh}.`);
  }
  if (currentHigh === null && amount < startBid) {
    throw new Error(`Bid must meet or exceed the minimum start bid of ${startBid}.`);
  }

  const previousBidderId = auction.currentBidderId;

  const bid = await prisma.$transaction(async (tx) => {
    const newBid = await tx.bid.create({
      data: { auctionId, bidderId, amount },
    });

    await tx.auction.update({
      where: { id: auctionId },
      data: {
        currentBid: amount,
        currentBidderId: bidderId,
        bidCount: { increment: 1 },
        // Transition SCHEDULED → ACTIVE on first bid
        ...(auction.status === "SCHEDULED" ? { status: "ACTIVE" } : {}),
      },
    });

    return newBid;
  });

  if (previousBidderId && previousBidderId !== bidderId) {
    await prisma.notification.create({
      data: {
        userId: previousBidderId,
        type: "OUTBID",
        payload: { auctionId, newHighBid: amount },
      },
    });
  }

  return bid;
}
