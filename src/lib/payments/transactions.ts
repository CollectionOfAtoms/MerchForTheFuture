import { prisma } from "@/lib/db";

export interface TransactionRecord {
  id: string;
  orderId: string;
  artworkTitle: string;
  listingId: string | null;
  grossAmount: number;
  platformFee: number;
  processingFee: number;
  netPayout: number;
  currency: string;
  createdAt: Date;
}

export interface OrderSummary {
  id: string;
  artworkTitle: string;
  totalAmount: number;
  currency: string;
  status: string;
  createdAt: Date;
}

export async function getTransactionHistory(sellerId: string): Promise<TransactionRecord[]> {
  const transactions = await prisma.transaction.findMany({
    where: {
      order: {
        originalListing: {
          artwork: { sellerId },
        },
      },
    },
    include: {
      order: {
        include: {
          originalListing: { include: { artwork: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return transactions.map((tx) => ({
    id: tx.id,
    orderId: tx.orderId,
    artworkTitle: tx.order.originalListing?.artwork.title ?? "",
    listingId: tx.order.originalListingId,
    grossAmount: Number(tx.grossAmount),
    platformFee: Number(tx.platformFee),
    processingFee: Number(tx.processingFee),
    netPayout: Number(tx.netPayout),
    currency: tx.currency,
    createdAt: tx.createdAt,
  }));
}

export async function exportTransactionsCSV(sellerId: string): Promise<string> {
  const records = await getTransactionHistory(sellerId);

  const headers = ["orderId", "artworkTitle", "listingId", "grossAmount", "platformFee", "processingFee", "netPayout", "currency", "createdAt"];
  const rows = records.map((r) =>
    [
      r.orderId,
      `"${r.artworkTitle}"`,
      r.listingId ?? "",
      r.grossAmount.toFixed(2),
      r.platformFee.toFixed(2),
      r.processingFee.toFixed(2),
      r.netPayout.toFixed(2),
      r.currency,
      r.createdAt.toISOString(),
    ].join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

export async function getOrderHistory(buyerId: string): Promise<OrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { buyerId, status: "PAID" },
    include: {
      originalListing: { include: { artwork: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return orders.map((o) => ({
    id: o.id,
    artworkTitle: o.originalListing?.artwork.title ?? "",
    totalAmount: Number(o.totalAmount),
    currency: o.currency,
    status: o.status,
    createdAt: o.createdAt,
  }));
}
