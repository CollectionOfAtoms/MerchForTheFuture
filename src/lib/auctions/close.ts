import { prisma } from "@/lib/db";
import { sendAuctionWonEmail, sendAuctionLostEmail } from "@/lib/payments/email";

const PAYMENT_WINDOW_HOURS = parseInt(process.env.AUCTION_PAYMENT_WINDOW_HOURS ?? "48", 10);

export async function closeAuction(auctionId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      originalListing: { include: { artwork: { include: { images: true } } } },
      bids: { select: { bidderId: true }, distinct: ["bidderId"] },
    },
  });

  if (!auction) throw new Error(`Auction not found: ${auctionId}`);
  if (auction.status === "CLOSED") return;

  const highBid = auction.currentBid ? Number(auction.currentBid) : null;
  const reserve = auction.reservePrice ? Number(auction.reservePrice) : null;
  const winnerId = auction.currentBidderId;
  const sellerId = auction.originalListing.artwork.sellerId;
  const reserveMet = highBid !== null && (reserve === null || highBid >= reserve);
  const now = new Date();
  const paymentDeadline = new Date(now.getTime() + PAYMENT_WINDOW_HOURS * 60 * 60 * 1000);

  let createdOrderId: string | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.auction.update({ where: { id: auctionId }, data: { status: "CLOSED" } });

    if (reserveMet && winnerId) {
      const order = await tx.order.create({
        data: {
          buyerId: winnerId,
          listingType: "ORIGINAL",
          originalListingId: auction.originalListingId,
          subtotal: highBid!,
          totalAmount: highBid!,
          paymentDeadline,
          status: "PENDING",
        },
      });
      createdOrderId = order.id;

      await tx.notification.create({
        data: {
          userId: winnerId,
          type: "AUCTION_WON",
          payload: { auctionId, orderId: order.id, winningBid: highBid },
        },
      });
      await tx.notification.create({
        data: {
          userId: sellerId,
          type: "AUCTION_CLOSED",
          payload: { auctionId, winningBid: highBid, winnerId },
        },
      });

      // Losing bidders
      const loserIds = auction.bids
        .map((b) => b.bidderId)
        .filter((id) => id !== winnerId);
      if (loserIds.length > 0) {
        await tx.notification.createMany({
          data: loserIds.map((userId) => ({
            userId,
            type: "AUCTION_LOST" as const,
            payload: { auctionId },
          })),
        });
      }
    } else if (!reserveMet && highBid !== null && winnerId) {
      await tx.originalListing.update({
        where: { id: auction.originalListingId },
        data: { status: "RESERVE_NOT_MET" },
      });
      await tx.notification.createMany({
        data: [winnerId, sellerId].map((userId) => ({
          userId,
          type: "RESERVE_NOT_MET" as const,
          payload: { auctionId, highBid },
        })),
      });
    } else {
      // No bids
      await tx.originalListing.update({
        where: { id: auction.originalListingId },
        data: { status: "ARCHIVED" },
      });
      await tx.notification.create({
        data: {
          userId: sellerId,
          type: "AUCTION_CLOSED",
          payload: { auctionId, winningBid: null, winnerId: null },
        },
      });
    }
  });

  // Send emails outside the transaction (non-fatal)
  if (reserveMet && winnerId && createdOrderId) {
    const aw = auction.originalListing.artwork;
    const primaryImage = aw.images.find((img) => img.isPrimary) ?? aw.images[0];
    const artworkForEmail = { id: aw.id, title: aw.title, imageUrl: primaryImage?.url };
    sendAuctionWonEmail(winnerId, createdOrderId, artworkForEmail, highBid!).catch(
      (e) => console.error("[closeAuction] sendAuctionWonEmail failed", e)
    );
    const loserIds = auction.bids.map((b) => b.bidderId).filter((id) => id !== winnerId);
    for (const loserId of loserIds) {
      sendAuctionLostEmail(loserId, artworkForEmail).catch(
        (e) => console.error("[closeAuction] sendAuctionLostEmail failed", e)
      );
    }
  }
}

export async function closeExpiredAuctions(): Promise<{ closed: number; skipped: number }> {
  const expired = await prisma.auction.findMany({
    where: { status: { in: ["ACTIVE", "SCHEDULED"] }, endAt: { lte: new Date() } },
    select: { id: true },
  });

  let closed = 0;
  let skipped = 0;
  for (const { id } of expired) {
    try {
      await closeAuction(id);
      closed++;
    } catch (e) {
      console.error(`[closeExpiredAuctions] Failed to close auction ${id}`, e);
      skipped++;
    }
  }
  return { closed, skipped };
}
