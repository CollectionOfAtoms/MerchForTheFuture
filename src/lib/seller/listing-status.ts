// Shared, presentation-agnostic helpers for seller listing status across both
// listing kinds (artwork + apparel). Pure — safe to import anywhere.

export type ListingKind = "ARTWORK" | "APPAREL";

/** Statuses a seller can set a listing to directly from the index or edit page. */
export type SettableListingStatus = "ACTIVE" | "UNLISTED" | "ARCHIVED";

export const LISTING_STATUS_STYLES: Record<string, { pill: string; label: string }> = {
  ACTIVE: { pill: "bg-emerald-100 text-emerald-700", label: "Active" },
  UNLISTED: { pill: "bg-violet-100 text-violet-700", label: "Unlisted" },
  ARCHIVED: { pill: "bg-stone-100 text-stone-500", label: "Archived" },
  SOLD: { pill: "bg-sky-100 text-sky-700", label: "Sold" },
  RESERVE_NOT_MET: { pill: "bg-amber-100 text-amber-700", label: "Reserve not met" },
  CANCELLED: { pill: "bg-red-100 text-red-600", label: "Cancelled" },
};

/**
 * Status transitions a seller can trigger, keyed by current status. SOLD (and
 * any status not listed) offers none.
 */
export const LISTING_STATUS_TRANSITIONS: Record<string, { label: string; target: SettableListingStatus }[]> = {
  ACTIVE: [{ label: "Unlist", target: "UNLISTED" }, { label: "Archive", target: "ARCHIVED" }],
  UNLISTED: [{ label: "Publish", target: "ACTIVE" }, { label: "Archive", target: "ARCHIVED" }],
  ARCHIVED: [{ label: "Publish", target: "ACTIVE" }],
};

export function listingStatusStyle(status: string): { pill: string; label: string } {
  return LISTING_STATUS_STYLES[status] ?? { pill: "bg-stone-100 text-stone-500", label: status };
}

export function listingStatusTransitions(status: string): { label: string; target: SettableListingStatus }[] {
  return LISTING_STATUS_TRANSITIONS[status] ?? [];
}

/**
 * Whether a listing's public detail page renders for the given status (so a
 * "View listing" / image link is live, not a 404). Artwork detail pages render
 * for any existing artwork regardless of status (they show "Sold", etc.); the
 * apparel detail page (`/shop/[id]`) renders only ACTIVE and UNLISTED listings.
 */
export function isPubliclyViewable(kind: ListingKind, status: string): boolean {
  if (kind === "ARTWORK") return true;
  return status === "ACTIVE" || status === "UNLISTED";
}

/**
 * Whether to show the "this listing is unlisted" owner notice on a public detail
 * page: only when the listing is UNLISTED and the current viewer is the seller
 * who owns it. Buyers reaching an UNLISTED listing by direct link see nothing.
 */
export function shouldShowOwnerUnlistedNotice(
  viewerId: string | null | undefined,
  sellerId: string,
  status: string,
): boolean {
  return status === "UNLISTED" && !!viewerId && viewerId === sellerId;
}

/** The public detail-page href for a listing (the buyer-facing product page). */
export function publicListingHref(
  kind: ListingKind,
  opts: { listingId: string; artworkId?: string },
): string {
  return kind === "ARTWORK" ? `/artwork/${opts.artworkId}` : `/shop/${opts.listingId}`;
}
