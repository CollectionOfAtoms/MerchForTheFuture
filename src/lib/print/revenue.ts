import { prisma } from "@/lib/db";

interface ArtworkPrintStats {
  artworkId: string;
  artworkTitle: string;
  unitsSold: number;
  revenue: number;
}

export interface PrintRevenueSummary {
  totalPrintSales: number;
  totalRevenue: number;
  totalPlatformFees: number;
  totalFulfillmentCosts: number;
  totalNetPayout: number;
  byArtwork: ArtworkPrintStats[];
}

export async function getPrintRevenueSummary(sellerId: string): Promise<PrintRevenueSummary> {
  const orders = await prisma.order.findMany({
    where: {
      listingType: "PRINT",
      status: "PAID",
      originalListing: { artwork: { sellerId } },
    },
    include: {
      transaction: true,
      originalListing: { include: { artwork: true } },
    },
  });

  if (orders.length === 0) {
    return {
      totalPrintSales: 0,
      totalRevenue: 0,
      totalPlatformFees: 0,
      totalFulfillmentCosts: 0,
      totalNetPayout: 0,
      byArtwork: [],
    };
  }

  let totalRevenue = 0;
  let totalPlatformFees = 0;
  let totalFulfillmentCosts = 0;
  let totalNetPayout = 0;

  const artworkMap = new Map<string, ArtworkPrintStats>();

  for (const order of orders) {
    const gross = Number(order.subtotal);
    totalRevenue += gross;

    if (order.transaction) {
      totalPlatformFees += Number(order.transaction.platformFee);
      totalFulfillmentCosts += Number(order.transaction.prodigiFulfillmentCost ?? 0);
      totalNetPayout += Number(order.transaction.netPayout);
    }

    const artworkId = order.originalListing!.artworkId;
    const artworkTitle = order.originalListing!.artwork.title;
    const existing = artworkMap.get(artworkId) ?? { artworkId, artworkTitle, unitsSold: 0, revenue: 0 };
    existing.unitsSold += order.quantity;
    existing.revenue += gross;
    artworkMap.set(artworkId, existing);
  }

  return {
    totalPrintSales: orders.length,
    totalRevenue,
    totalPlatformFees,
    totalFulfillmentCosts,
    totalNetPayout,
    byArtwork: Array.from(artworkMap.values()),
  };
}
