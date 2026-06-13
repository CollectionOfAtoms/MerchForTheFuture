import { prisma } from "@/lib/db";

/**
 * A single row in the seller's unified listings index, normalized across every
 * kind of thing a seller can list. New product kinds (e.g. a future provider)
 * add a new member to this union and a branch in `getSellerListings` — the
 * index page renders off the shared fields and switches on `kind` for the rest.
 */
export type SellerListingRow =
  | {
      kind: "ARTWORK";
      id: string;
      title: string;
      thumbnailUrl: string | null;
      status: string;
      createdAt: Date;
      saleType: string;
      price: number | null;
      hasBids: boolean;
      auctionEndAt: Date | null;
      artworkId: string;
    }
  | {
      kind: "APPAREL";
      id: string;
      title: string;
      thumbnailUrl: string | null;
      status: string;
      createdAt: Date;
      sourcingMode: "DESIGNED" | "REFERENCED";
      // Designed: the curated product-type name. Referenced: a provider label
      // (Teemill is named openly in referenced mode — no seller opacity here).
      productTypeName: string;
      retailPrice: number;
    };

/**
 * Every listing the seller owns — artwork and apparel today — merged into one
 * list, newest first.
 */
export async function getSellerListings(sellerId: string): Promise<SellerListingRow[]> {
  const [artworkListings, apparelListings] = await Promise.all([
    prisma.originalListing.findMany({
      where: { artwork: { sellerId } },
      include: {
        artwork: {
          include: {
            images: {
              where: { isPrimary: true },
              take: 1,
              select: { url: true, thumbnailUrl: true, gridUrl: true },
            },
          },
        },
        auction: { select: { bidCount: true, endAt: true } },
      },
    }),
    prisma.apparelListing.findMany({
      where: { sellerId },
      include: {
        productType: { select: { name: true } },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { originalUrl: true, thumbnailUrl: true, gridUrl: true },
        },
        // Referenced listings have no lifestyle photo until one is uploaded; fall
        // back to a cached Teemill mockup so the row is never blank.
        referencedVariants: {
          where: { mockupUrl: { not: null } },
          take: 1,
          select: { mockupUrl: true },
        },
      },
    }),
  ]);

  const providerLabel = (providerKey: string | null): string =>
    providerKey ? providerKey.charAt(0).toUpperCase() + providerKey.slice(1) : "Apparel";

  const rows: SellerListingRow[] = [
    ...artworkListings.map((l): SellerListingRow => {
      const img = l.artwork.images[0];
      return {
        kind: "ARTWORK",
        id: l.id,
        title: l.artwork.title,
        thumbnailUrl: img?.thumbnailUrl ?? img?.gridUrl ?? img?.url ?? null,
        status: l.status,
        createdAt: l.createdAt,
        saleType: l.saleType,
        price: l.price != null ? Number(l.price) : null,
        hasBids: (l.auction?.bidCount ?? 0) > 0,
        auctionEndAt: l.auction?.endAt ?? null,
        artworkId: l.artwork.id,
      };
    }),
    ...apparelListings.map((l): SellerListingRow => {
      const img = l.images[0];
      const mockup = l.referencedVariants[0]?.mockupUrl ?? null;
      return {
        kind: "APPAREL",
        id: l.id,
        title: l.title,
        // Lifestyle photo if present; otherwise fall back to a cached Teemill
        // mockup (referenced) or the seller-only design image (designed) so the
        // row is never blank.
        thumbnailUrl:
          img?.thumbnailUrl ?? img?.gridUrl ?? img?.originalUrl ?? mockup ?? l.designImageUrl ?? null,
        status: l.status,
        createdAt: l.createdAt,
        sourcingMode: l.sourcingMode,
        productTypeName: l.productType?.name ?? providerLabel(l.providerKey),
        retailPrice: Number(l.retailPrice),
      };
    }),
  ];

  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return rows;
}
