import { prisma } from "@/lib/db";
import { Auction } from "@/generated/prisma/client";

export interface AuctionConfig {
  originalListingId: string;
  startBid: number;
  reservePrice?: number;
  endAt: Date;
}

const MIN_DURATION_MS = 24 * 60 * 60 * 1000;

export async function createAuction(config: AuctionConfig): Promise<Auction> {
  const { originalListingId, startBid, reservePrice, endAt } = config;

  if (startBid <= 0) throw new Error("Start bid must be greater than zero.");

  const now = Date.now();
  if (endAt.getTime() <= now) throw new Error("Auction end date must be in the future and at least 24 hours away.");
  if (endAt.getTime() - now < MIN_DURATION_MS) throw new Error("Auction duration must be at least 24 hours.");

  return prisma.auction.create({
    data: {
      originalListingId,
      startBid,
      reservePrice: reservePrice ?? null,
      endAt,
      status: "SCHEDULED",
    },
  });
}
