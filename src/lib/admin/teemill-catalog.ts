import { prisma } from "@/lib/db";

export type CostSortDir = "asc" | "desc";

export interface TeemillCatalogRow {
  id: string;
  title: string;
  sellerName: string | null;
  status: string;
  retailPrice: number;
  providerBaseCurrency: string | null;
  providerBasePrice: number | null;
  usLandedCost: number | null;
}

/**
 * Sort rows by US-landed cost (US-MFTF-19.6). Unrecorded (null) costs always sort
 * last in either direction so they never read as cheapest. Pure + non-mutating.
 */
export function sortByUsLandedCost<T extends { usLandedCost: number | null }>(
  rows: T[],
  dir: CostSortDir,
): T[] {
  return [...rows].sort((a, b) => {
    if (a.usLandedCost == null && b.usLandedCost == null) return 0;
    if (a.usLandedCost == null) return 1;
    if (b.usLandedCost == null) return -1;
    return dir === "asc" ? a.usLandedCost - b.usLandedCost : b.usLandedCost - a.usLandedCost;
  });
}

/**
 * All REFERENCED (Teemill) listings for the admin catalog/audit view, optionally
 * sorted by US-landed cost. Founder/admin-only data — the buyer projection never
 * carries cost.
 */
export async function getTeemillCatalogRows(sort?: CostSortDir): Promise<TeemillCatalogRow[]> {
  const listings = await prisma.apparelListing.findMany({
    where: { sourcingMode: "REFERENCED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      retailPrice: true,
      providerBaseCurrency: true,
      providerBasePrice: true,
      usLandedCost: true,
      seller: { select: { name: true } },
    },
  });
  const rows: TeemillCatalogRow[] = listings.map((l) => ({
    id: l.id,
    title: l.title,
    sellerName: l.seller?.name ?? null,
    status: l.status,
    retailPrice: Number(l.retailPrice),
    providerBaseCurrency: l.providerBaseCurrency,
    providerBasePrice: l.providerBasePrice != null ? Number(l.providerBasePrice) : null,
    usLandedCost: l.usLandedCost,
  }));
  return sort ? sortByUsLandedCost(rows, sort) : rows;
}
