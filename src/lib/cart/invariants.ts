/**
 * Application-layer invariants for `Cart` and `CartItem` (US-MFTF-11.1).
 *
 * Prisma cannot express these cross-field rules as DB constraints (consistent
 * with the US-MFTF-5.1 single-FK-per-row convention), so they are enforced here
 * and called from the cart core (`src/lib/cart/cart.ts`) before any write:
 *
 *   Cart      ⇒ exactly one of { userId, guestToken } is non-null
 *   CartItem  ⇒ exactly one of { apparelListingId, listingId } is non-null,
 *               and it matches itemKind (APPAREL → apparelListingId,
 *               PRINT → listingId); quantity is an integer ≥ 1
 */

export type CartItemKind = "APPAREL" | "PRINT";

export type InvariantResult = { valid: true } | { valid: false; error: string };

export interface CartOwnerInput {
  userId: string | null;
  guestToken: string | null;
}

export function validateCartOwnerInvariant(input: CartOwnerInput): InvariantResult {
  const hasUser = Boolean(input.userId);
  const hasGuest = Boolean(input.guestToken);
  if (hasUser === hasGuest) {
    return {
      valid: false,
      error: "Exactly one of userId or guestToken must be set on a cart.",
    };
  }
  return { valid: true };
}

export interface CartItemRefInput {
  itemKind: CartItemKind;
  apparelListingId: string | null;
  listingId: string | null;
  quantity: number;
}

export function validateCartItemInvariant(input: CartItemRefInput): InvariantResult {
  const { itemKind, apparelListingId, listingId, quantity } = input;

  const hasApparel = Boolean(apparelListingId);
  const hasPrint = Boolean(listingId);
  if (hasApparel === hasPrint) {
    return {
      valid: false,
      error: "Exactly one of apparelListingId or listingId must be set on a cart item.",
    };
  }

  if (itemKind === "APPAREL" && !hasApparel) {
    return { valid: false, error: "APPAREL cart items must reference an apparel listing." };
  }
  if (itemKind === "PRINT" && !hasPrint) {
    return { valid: false, error: "PRINT cart items must reference an artwork listing." };
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { valid: false, error: "Cart item quantity must be an integer of at least 1." };
  }

  return { valid: true };
}
