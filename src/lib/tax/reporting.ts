import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export interface TaxReportFilters {
  from?: Date;
  to?: Date;
}

export interface TaxReportRow {
  jurisdiction: string;
  totalTaxCollected: Prisma.Decimal | number;
  totalSales: Prisma.Decimal | number;
  orderCount: number;
}

export async function getTaxReport(
  sellerId: string,
  filters: TaxReportFilters
): Promise<TaxReportRow[]> {
  const where: Prisma.OrderWhereInput = {
    status: "PAID",
    taxJurisdiction: { not: null },
    originalListing: {
      artwork: { sellerId },
    },
  };

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) (where.createdAt as Prisma.DateTimeFilter).gte = filters.from;
    if (filters.to) (where.createdAt as Prisma.DateTimeFilter).lte = filters.to;
  }

  const orders = await prisma.order.findMany({
    where,
    select: {
      taxJurisdiction: true,
      taxAmount: true,
      subtotal: true,
    },
  });

  const grouped = new Map<string, { taxTotal: number; salesTotal: number; count: number }>();
  for (const order of orders) {
    const j = order.taxJurisdiction!;
    const existing = grouped.get(j) ?? { taxTotal: 0, salesTotal: 0, count: 0 };
    existing.taxTotal += Number(order.taxAmount);
    existing.salesTotal += Number(order.subtotal);
    existing.count += 1;
    grouped.set(j, existing);
  }

  return Array.from(grouped.entries()).map(([jurisdiction, data]) => ({
    jurisdiction,
    totalTaxCollected: data.taxTotal,
    totalSales: data.salesTotal,
    orderCount: data.count,
  }));
}

export async function exportTaxReportCSV(
  sellerId: string,
  filters: TaxReportFilters
): Promise<string> {
  const rows = await getTaxReport(sellerId, filters);
  const header = "jurisdiction,totalTaxCollected,totalSales,orderCount";
  const lines = rows.map(
    (r) =>
      `${r.jurisdiction},${Number(r.totalTaxCollected).toFixed(2)},${Number(r.totalSales).toFixed(2)},${r.orderCount}`
  );
  return [header, ...lines].join("\n");
}
