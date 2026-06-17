/**
 * App-layer invariants for the multi-item order model (US-MFTF-12.2).
 *
 * The schema cannot express "exactly one of these two nullable FKs" or "an Order
 * uses single-listing FKs XOR OrderItem rows", so these are enforced in code at
 * the write sites (checkout creation, legacy order creation). Mirrors the cart's
 * `src/lib/cart/invariants.ts` pattern.
 */
import type { CartItemKind } from "@/generated/prisma/client";

export type InvariantResult = { valid: true } | { valid: false; error: string };

export interface OrderItemReference {
  itemKind: CartItemKind;
  apparelListingId?: string | null;
  listingId?: string | null;
}

/**
 * An `OrderItem` must reference exactly one listing, and the reference kind must
 * match `itemKind` (APPAREL → apparelListingId, PRINT → listingId).
 */
export function validateOrderItemReference(ref: OrderItemReference): InvariantResult {
  const hasApparel = !!ref.apparelListingId;
  const hasListing = !!ref.listingId;

  if (hasApparel === hasListing) {
    return {
      valid: false,
      error: "An OrderItem must reference exactly one of apparelListingId or listingId.",
    };
  }
  if (ref.itemKind === "APPAREL" && !hasApparel) {
    return { valid: false, error: "An APPAREL OrderItem must set apparelListingId." };
  }
  if (ref.itemKind === "PRINT" && !hasListing) {
    return { valid: false, error: "A PRINT OrderItem must set listingId." };
  }
  return { valid: true };
}

export interface OrderShape {
  originalListingId?: string | null;
  apparelListingId?: string | null;
  orderItemCount: number;
}

/**
 * An `Order` uses either the legacy single-listing FKs (original buy-now, auction
 * wins) or `OrderItem` rows (cart checkouts) — never both.
 */
export function validateOrderShape(order: OrderShape): InvariantResult {
  const hasSingleFk = !!order.originalListingId || !!order.apparelListingId;
  const hasItems = order.orderItemCount > 0;
  if (hasSingleFk && hasItems) {
    return {
      valid: false,
      error: "An Order must use either single-listing FKs (legacy) or OrderItem rows, never both.",
    };
  }
  return { valid: true };
}
