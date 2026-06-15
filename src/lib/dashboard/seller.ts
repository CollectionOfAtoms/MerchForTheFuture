import { prisma } from "@/lib/db";
import { getSellerListings, type SellerListingRow } from "@/lib/seller/listings";

// ─── Listing summary ──────────────────────────────────────────────────────────

export interface SellerListingSummary {
  active: number;
  sold: number;
  archived: number;
  total: number;
}

export async function getSellerListingSummary(sellerId: string): Promise<SellerListingSummary> {
  // Count artwork (originalListing) and apparel (apparelListing) listings into
  // one summary. Apparel covers both sourcing modes — the status enum is shared,
  // so designed and referenced listings are counted identically (MFTF-6.3).
  const [artworkGroups, apparelGroups] = await Promise.all([
    prisma.originalListing.groupBy({
      by: ["status"],
      where: { artwork: { sellerId } },
      _count: { id: true },
    }),
    prisma.apparelListing.groupBy({
      by: ["status"],
      where: { sellerId },
      _count: { id: true },
    }),
  ]);

  const summary: SellerListingSummary = { active: 0, sold: 0, archived: 0, total: 0 };
  for (const group of [...artworkGroups, ...apparelGroups]) {
    const count = group._count.id;
    summary.total += count;
    if (group.status === "ACTIVE") summary.active += count;
    else if (group.status === "SOLD") summary.sold += count;
    else if (group.status === "ARCHIVED") summary.archived += count;
  }
  return summary;
}

// ─── Active listings ──────────────────────────────────────────────────────────

/**
 * Active listings for the seller dashboard preview — artwork and apparel (both
 * sourcing modes) merged into one newest-first list via the unified seller
 * index reader, filtered to ACTIVE. Returns the same `SellerListingRow` shape
 * the /seller/listings index uses.
 */
export async function getSellerActiveListings(sellerId: string): Promise<SellerListingRow[]> {
  const rows = await getSellerListings(sellerId);
  return rows.filter((r) => r.status === "ACTIVE");
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
