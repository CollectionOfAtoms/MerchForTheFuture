import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type SortOrder = "newest" | "price_asc" | "price_desc" | "ending_soonest";
export type Availability = "original" | "print" | "both";

export interface BrowseFilters {
  saleType?: "FIXED_PRICE" | "AUCTION";
  availability?: Availability;
  minPrice?: number;
  maxPrice?: number;
  medium?: string;
  year?: number;
}

export interface BrowseOptions {
  q?: string;
  filters?: BrowseFilters;
  sort?: SortOrder;
  page?: number;
  limit?: number;
}

export interface ArtworkCard {
  id: string;
  title: string;
  medium: string | null;
  year: number | null;
  sellerId: string;
  artist: string | null;
  primaryImageUrl: string | null;
  hasOriginal: boolean;
  hasPrint: boolean;
  originalStatus: string | null;
  saleType: string | null;
  price: number | null;
  currency: string | null;
  publishedAt: Date | null;
}

export interface BrowseResult {
  artworks: ArtworkCard[];
  total: number;
  page: number;
  totalPages: number;
}

function buildWhere(opts: BrowseOptions): Prisma.ArtworkWhereInput {
  const { q, filters = {} } = opts;
  const { saleType, availability, minPrice, maxPrice, medium } = filters;

  const conditions: Prisma.ArtworkWhereInput[] = [
    { status: "PUBLISHED" },
    { images: { some: {} } },
  ];

  // Search across title, description, medium, seller name
  if (q) {
    conditions.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { medium: { contains: q, mode: "insensitive" } },
        { artist: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  // Sale type filter (via originalListing)
  if (saleType) {
    conditions.push({ originalListing: { saleType } });
  }

  // Availability filter
  if (availability === "original") {
    conditions.push({ originalListing: { status: "ACTIVE" } });
  } else if (availability === "print") {
    conditions.push({ originalListing: { availableForPrint: true } });
  } else if (availability === "both") {
    conditions.push({ originalListing: { status: "ACTIVE", availableForPrint: true } });
  }

  // Price range filter (applies to originalListing.price for fixed price)
  if (minPrice !== undefined) {
    conditions.push({ originalListing: { price: { gte: minPrice } } });
  }
  if (maxPrice !== undefined) {
    conditions.push({ originalListing: { price: { lte: maxPrice } } });
  }

  // Medium filter
  if (medium) {
    conditions.push({ medium: { contains: medium, mode: "insensitive" } });
  }

  // Hide artworks when original is ARCHIVED and not available for print
  conditions.push({
    OR: [
      { originalListing: { is: null } },
      { originalListing: { status: { in: ["ACTIVE", "SOLD"] } } },
      { originalListing: { availableForPrint: true } },
    ],
  });

  // UNLISTED listings are viewable by direct link only — never surface them in
  // browse, even when print is available.
  conditions.push({ NOT: { originalListing: { status: "UNLISTED" } } });

  return { AND: conditions };
}

function buildOrderBy(sort: SortOrder = "newest"): Prisma.ArtworkOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ originalListing: { price: "asc" } }, { publishedAt: "desc" }];
    case "price_desc":
      return [{ originalListing: { price: "desc" } }, { publishedAt: "desc" }];
    case "ending_soonest":
      return [{ originalListing: { auction: { endAt: "asc" } } }, { publishedAt: "desc" }];
    case "newest":
    default:
      return [{ publishedAt: "desc" }];
  }
}

function toCard(raw: Awaited<ReturnType<typeof fetchRaw>>[number]): ArtworkCard {
  const listing = raw.originalListing;
  const auction = listing?.auction ?? null;

  let price: number | null = null;
  if (listing?.saleType === "FIXED_PRICE" && listing.price != null) {
    price = Number(listing.price);
  } else if (listing?.saleType === "AUCTION" && auction) {
    price = Number(auction.currentBid ?? auction.startBid);
  }

  const primaryImage = raw.images.find((img) => img.isPrimary) ?? null;

  return {
    id: raw.id,
    title: raw.title,
    medium: raw.medium,
    year: raw.year,
    sellerId: raw.sellerId,
    artist: raw.artist,
    primaryImageUrl: primaryImage?.url ?? null,
    hasOriginal: listing != null,
    hasPrint: listing?.availableForPrint ?? false,
    originalStatus: listing?.status ?? null,
    saleType: listing?.saleType ?? null,
    price,
    currency: listing?.currency ?? null,
    publishedAt: raw.publishedAt,
  };
}

const artworkInclude = {
  images: { select: { url: true, isPrimary: true } },
  originalListing: {
    select: { saleType: true, price: true, currency: true, status: true, availableForPrint: true, auction: { select: { startBid: true, currentBid: true, endAt: true } } },
  },
} satisfies Prisma.ArtworkInclude;

async function fetchRaw(where: Prisma.ArtworkWhereInput, orderBy: Prisma.ArtworkOrderByWithRelationInput[], skip: number, take: number) {
  return prisma.artwork.findMany({ where, include: artworkInclude, orderBy, skip, take });
}

export async function browseArtworks(opts: BrowseOptions): Promise<BrowseResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 24));
  const skip = (page - 1) * limit;

  const where = buildWhere(opts);
  const orderBy = buildOrderBy(opts.sort);

  const [raw, total] = await Promise.all([
    fetchRaw(where, orderBy, skip, limit),
    prisma.artwork.count({ where }),
  ]);

  return {
    artworks: raw.map(toCard),
    total,
    page,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
