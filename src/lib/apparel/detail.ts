import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  referencedListingColors,
  referencedListingSizes,
  referencedListingImages,
} from "@/lib/apparel/referenced";
import { getApparelSizesForBlank } from "@/lib/apparel/sizes";

/**
 * A swatch in the buyer-facing colour picker, normalized across sourcing modes:
 * referenced colours carry a `hex`; designed colours carry a `swatchImageUrl`
 * (the provider-sourced colour photo). The picker renders whichever is present —
 * it never branches on sourcing mode.
 */
export interface ApparelDetailColor {
  name: string;
  hex: string | null;
  swatchImageUrl: string | null;
}

export interface ApparelDetailImage {
  url: string;
  /** Colour name when the image is a per-colour mockup; null for lifestyle photos. */
  colorName: string | null;
}

/**
 * The normalized buyer-facing product detail. Identical shape for DESIGNED and
 * REFERENCED listings; carries no provider name, base cost, currency, or
 * `sourcingMode`. Buyers always see the fixed USD `retailPrice`.
 */
export interface ApparelDetail {
  id: string;
  title: string;
  description: string | null;
  retailPrice: number;
  images: ApparelDetailImage[];
  colors: ApparelDetailColor[];
  sizes: string[];
}

const detailInclude = {
  productType: {
    include: {
      sizes: { orderBy: { sortOrder: "asc" } },
    },
  },
  colors: {
    where: { isOffered: true },
    include: { productTypeColor: { select: { colorName: true, colorImageUrl: true } } },
  },
  images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
  // Preserve ingest order (cuid ids are creation-ordered) so colours and sizes
  // appear as Teemill's catalog lists them (e.g. S, M, L, XL) rather than
  // alphabetically — there is no explicit sortOrder column on the snapshot.
  referencedVariants: { orderBy: { id: "asc" } },
} satisfies Prisma.ApparelListingInclude;

type RawDetail = Prisma.ApparelListingGetPayload<{ include: typeof detailInclude }>;

function toColors(listing: RawDetail): ApparelDetailColor[] {
  // Exactly one source is populated per listing, so this resolves the sourcing
  // mode without the projection ever exposing it.
  if (listing.referencedVariants.length > 0) {
    return referencedListingColors(listing.referencedVariants).map((c) => ({
      name: c.colorName,
      hex: c.colorHex,
      swatchImageUrl: null,
    }));
  }
  return listing.colors.map((c) => ({
    name: c.productTypeColor.colorName,
    hex: null,
    swatchImageUrl: c.productTypeColor.colorImageUrl,
  }));
}

function toSizes(listing: RawDetail): string[] {
  if (listing.referencedVariants.length > 0) {
    return referencedListingSizes(listing.referencedVariants);
  }
  // Designed (Prodigi): honor explicit admin-curated size rows if any exist, else
  // use provider-sourced sizes for the blank (the default model — admins no longer
  // whitelist sizes). Without this, a product type with no size rows yielded an
  // empty list and disabled "Add to cart".
  const explicit = (listing.productType?.sizes ?? []).map((s) => s.sizeLabel);
  if (explicit.length > 0) return explicit;
  return getApparelSizesForBlank(listing.productType?.providerSkuBase);
}

function toImages(listing: RawDetail): ApparelDetailImage[] {
  // Uploaded lifestyle photos win in both modes (the read orders them primary
  // first); referenced listings without photos fall back to cached mockups.
  if (listing.images.length > 0) {
    return listing.images.map((i) => ({ url: i.displayUrl ?? i.originalUrl, colorName: null }));
  }
  // referencedListingImages returns mockups (one per distinct colour) when there
  // are no lifestyle photos. Pair each mockup back to its colour for the optional
  // colour→image swap on the detail page.
  const urls = referencedListingImages({ lifestyle: [], variants: listing.referencedVariants });
  return urls.map((url) => ({
    url,
    colorName: listing.referencedVariants.find((v) => v.mockupUrl === url)?.colorName ?? null,
  }));
}

/**
 * Buyer-facing apparel product detail. Returns null when the listing does not
 * exist or is not ACTIVE (callers render a 404). Renders both sourcing modes
 * from one normalized projection.
 */
export async function getApparelListingDetail(listingId: string): Promise<ApparelDetail | null> {
  const listing = await prisma.apparelListing.findUnique({
    where: { id: listingId },
    include: detailInclude,
  });
  // ACTIVE listings are live; UNLISTED listings are viewable by direct link
  // (a seller's pre-launch preview). ARCHIVED/SOLD/missing render a 404.
  if (!listing || (listing.status !== "ACTIVE" && listing.status !== "UNLISTED")) return null;

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    retailPrice: Number(listing.retailPrice),
    images: toImages(listing),
    colors: toColors(listing),
    sizes: toSizes(listing),
  };
}

/**
 * Owner + status for a listing — used server-side to decide whether to show the
 * seller their "unlisted" notice on the public product page. Kept off the
 * buyer-facing `ApparelDetail` projection so `sellerId` is never sent to the
 * client. Returns null when the listing does not exist.
 */
export async function getApparelListingOwnership(
  listingId: string,
): Promise<{ sellerId: string; status: string } | null> {
  return prisma.apparelListing.findUnique({
    where: { id: listingId },
    select: { sellerId: true, status: true },
  });
}
