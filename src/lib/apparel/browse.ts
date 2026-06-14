import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { referencedListingColors } from "@/lib/apparel/referenced";

/**
 * A single apparel tile on the public storefront (`/shop`). This is the
 * normalized buyer-facing projection: it is identical for DESIGNED and
 * REFERENCED listings and deliberately carries no provider name, base cost,
 * currency, or `sourcingMode` — buyers always see the fixed USD retail price.
 */
export interface ApparelCard {
  id: string;
  title: string;
  primaryImageUrl: string | null;
  retailPrice: number;
  colorCount: number;
}

export interface ApparelBrowseResult {
  listings: ApparelCard[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ApparelBrowseOptions {
  page?: number;
  limit?: number;
}

const browseInclude = {
  colors: { where: { isOffered: true }, select: { id: true } },
  images: {
    orderBy: { sortOrder: "asc" },
    select: { gridUrl: true, thumbnailUrl: true, originalUrl: true, isPrimary: true },
  },
  referencedVariants: { select: { colorName: true, mockupUrl: true } },
} satisfies Prisma.ApparelListingInclude;

type RawListing = Prisma.ApparelListingGetPayload<{ include: typeof browseInclude }>;

function toCard(listing: RawListing): ApparelCard {
  // Colour count comes from whichever source backs the listing: offered
  // ApparelListingColor rows (designed) or distinct ReferencedVariant colours
  // (referenced). Exactly one is populated, so the projection never branches on
  // sourcingMode.
  const colorCount =
    listing.referencedVariants.length > 0
      ? referencedListingColors(
          listing.referencedVariants.map((v) => ({ colorName: v.colorName, colorHex: "" })),
        ).length
      : listing.colors.length;

  // Prefer an uploaded lifestyle photo (grid variant for tiles); otherwise fall
  // back to a cached provider mockup so referenced listings without photos still
  // render an image.
  const primary = listing.images.find((i) => i.isPrimary) ?? listing.images[0] ?? null;
  const primaryImageUrl =
    primary?.gridUrl ??
    primary?.thumbnailUrl ??
    primary?.originalUrl ??
    listing.referencedVariants.find((v) => v.mockupUrl)?.mockupUrl ??
    null;

  return {
    id: listing.id,
    title: listing.title,
    primaryImageUrl,
    retailPrice: Number(listing.retailPrice),
    colorCount,
  };
}

/**
 * Public apparel storefront read. Returns only ACTIVE listings, newest first,
 * paginated at a maximum of 24 per page. Renders both sourcing modes from one
 * uniform card shape.
 */
export async function getApparelListings(
  opts: ApparelBrowseOptions = {},
): Promise<ApparelBrowseResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(24, Math.max(1, opts.limit ?? 24));
  const skip = (page - 1) * limit;

  const where: Prisma.ApparelListingWhereInput = { status: "ACTIVE" };

  const [raw, total] = await Promise.all([
    prisma.apparelListing.findMany({
      where,
      include: browseInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.apparelListing.count({ where }),
  ]);

  return {
    listings: raw.map(toCard),
    total,
    page,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
