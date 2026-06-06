import { prisma } from "@/lib/db";

// ─── Listing summary ──────────────────────────────────────────────────────────

export interface SellerListingSummary {
  active: number;
  sold: number;
  archived: number;
  total: number;
}

export async function getSellerListingSummary(sellerId: string): Promise<SellerListingSummary> {
  const groups = await prisma.originalListing.groupBy({
    by: ["status"],
    where: { artwork: { sellerId } },
    _count: { id: true },
  });

  const summary: SellerListingSummary = { active: 0, sold: 0, archived: 0, total: 0 };
  for (const group of groups) {
    const count = group._count.id;
    summary.total += count;
    if (group.status === "ACTIVE") summary.active = count;
    else if (group.status === "SOLD") summary.sold = count;
    else if (group.status === "ARCHIVED") summary.archived = count;
  }
  return summary;
}

// ─── Active listings ──────────────────────────────────────────────────────────

export async function getSellerActiveListings(sellerId: string) {
  return prisma.originalListing.findMany({
    where: { status: "ACTIVE", artwork: { sellerId } },
    include: {
      artwork: {
        select: {
          title: true,
          images: { where: { isPrimary: true }, take: 1, select: { url: true, thumbnailUrl: true, gridUrl: true, isPrimary: true } },
        },
      },
      auction: { select: { endAt: true, currentBid: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Recent activity ──────────────────────────────────────────────────────────

export interface SellerActivityEvent {
  type: "bid_received" | "purchase_completed" | "auction_ending_soon";
  description: string;
  date: Date;
}

export async function getSellerRecentActivity(sellerId: string): Promise<SellerActivityEvent[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const twentyFourHoursFromNow = new Date(Date.now() + 24 * 3600 * 1000);

  const [recentBids, recentOrders, endingSoonAuctions] = await Promise.all([
    prisma.bid.findMany({
      where: {
        placedAt: { gte: thirtyDaysAgo },
        auction: { originalListing: { artwork: { sellerId } } },
      },
      orderBy: { placedAt: "desc" },
      take: 20,
      include: {
        auction: {
          include: { originalListing: { include: { artwork: { select: { title: true } } } } },
        },
      },
    }),
    prisma.order.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        originalListing: { artwork: { sellerId } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        originalListing: { include: { artwork: { select: { title: true } } } },
      },
    }),
    prisma.auction.findMany({
      where: {
        status: "ACTIVE",
        endAt: { lte: twentyFourHoursFromNow, gte: new Date() },
        originalListing: { artwork: { sellerId } },
      },
      include: { originalListing: { include: { artwork: { select: { title: true } } } } },
    }),
  ]);

  const events: SellerActivityEvent[] = [
    ...recentBids.map((b) => ({
      type: "bid_received" as const,
      description: `New bid of $${b.amount} on ${b.auction.originalListing.artwork.title}`,
      date: b.placedAt,
    })),
    ...recentOrders.map((o) => ({
      type: "purchase_completed" as const,
      description: `Sale completed: ${o.originalListing?.artwork.title ?? "Print"} for $${o.totalAmount}`,
      date: o.createdAt,
    })),
    ...endingSoonAuctions.map((a) => ({
      type: "auction_ending_soon" as const,
      description: `Auction ending soon: ${a.originalListing.artwork.title}`,
      date: a.endAt,
    })),
  ];

  return events.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);
}

// ─── Revenue snapshot ─────────────────────────────────────────────────────────

export interface SellerRevenue {
  originalRevenue: number;
  printRevenue: number;
  total: number;
}

export async function getSellerRevenue(sellerId: string): Promise<SellerRevenue> {
  const [originalTransactions, printTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        order: {
          listingType: "ORIGINAL",
          originalListing: { artwork: { sellerId } },
        },
      },
      select: { netPayout: true },
    }),
    prisma.transaction.findMany({
      where: {
        order: {
          listingType: "PRINT",
          originalListing: { artwork: { sellerId } },
        },
      },
      select: { netPayout: true },
    }),
  ]);

  const originalRevenue = originalTransactions.reduce(
    (sum, t) => sum + Number(t.netPayout),
    0
  );
  const printRevenue = printTransactions.reduce(
    (sum, t) => sum + Number(t.netPayout),
    0
  );

  return { originalRevenue, printRevenue, total: originalRevenue + printRevenue };
}
