/**
 * Core cart persistence (US-MFTF-11). Pure DB logic with no `next/headers` or
 * auth imports, so it is unit-testable in the node test environment. Request-
 * scoped concerns (resolving the session user vs. the guest-cookie token, setting
 * cookies) live in `src/lib/cart/request.ts`; cookie I/O lives in
 * `src/lib/cart/cookies.ts`.
 *
 * Every mutation touches `Cart.updatedAt` (Prisma `@updatedAt` updates it on any
 * write to the Cart row; helpers here always write the Cart row alongside item
 * changes so staleness — US-MFTF-11.6 — tracks real activity).
 */
import { prisma } from "@/lib/db";
import type { Prisma, Cart, CartItem } from "@/generated/prisma/client";
import { validateCartItemInvariant, type CartItemKind } from "@/lib/cart/invariants";

export async function findOrCreateUserCart(userId: string): Promise<Cart> {
  const existing = await prisma.cart.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.cart.create({ data: { userId } });
}

export async function findOrCreateGuestCart(guestToken: string): Promise<Cart> {
  const existing = await prisma.cart.findUnique({ where: { guestToken } });
  if (existing) return existing;
  return prisma.cart.create({ data: { guestToken } });
}

export interface AddItemInput {
  itemKind: CartItemKind;
  apparelListingId?: string | null;
  listingId?: string | null;
  selection: Prisma.InputJsonValue;
  quantity?: number;
}

/**
 * Add an item to a cart, deduplicating on identical
 * (itemKind, listing reference, selection): a matching row has its quantity
 * incremented instead of inserting a duplicate. Touches `Cart.updatedAt`.
 * Assumes `selection` has already been structurally validated by the caller.
 */
export async function addItem(cartId: string, input: AddItemInput): Promise<CartItem> {
  const apparelListingId = input.apparelListingId ?? null;
  const listingId = input.listingId ?? null;
  const quantity = input.quantity ?? 1;

  const invariant = validateCartItemInvariant({
    itemKind: input.itemKind,
    apparelListingId,
    listingId,
    quantity,
  });
  if (!invariant.valid) throw new Error(invariant.error);

  // Look for an identical existing line (same kind, same listing ref, same
  // selection) and merge into it. `selection` equality is a JSON value match.
  const candidates = await prisma.cartItem.findMany({
    where: { cartId, itemKind: input.itemKind, apparelListingId, listingId },
  });
  const match = candidates.find((c) => selectionsEqual(c.selection, input.selection));

  const result = match
    ? await prisma.cartItem.update({
        where: { id: match.id },
        data: { quantity: match.quantity + quantity },
      })
    : await prisma.cartItem.create({
        data: { cartId, itemKind: input.itemKind, apparelListingId, listingId, selection: input.selection, quantity },
      });

  await touchCart(cartId);
  return result;
}

/** Set an item's quantity (min 1). Ownership must be checked by the caller. */
export async function setItemQuantity(cartItemId: string, quantity: number): Promise<CartItem> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Cart item quantity must be an integer of at least 1.");
  }
  const updated = await prisma.cartItem.update({ where: { id: cartItemId }, data: { quantity } });
  await touchCart(updated.cartId);
  return updated;
}

/** Remove an item. Ownership must be checked by the caller. */
export async function removeItem(cartItemId: string): Promise<void> {
  const item = await prisma.cartItem.findUnique({ where: { id: cartItemId }, select: { cartId: true } });
  if (!item) return;
  await prisma.cartItem.delete({ where: { id: cartItemId } });
  await touchCart(item.cartId);
}

/** Total quantity across all items in a cart (the nav badge count). */
export async function cartItemCount(cartId: string): Promise<number> {
  const agg = await prisma.cartItem.aggregate({ where: { cartId }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

async function touchCart(cartId: string): Promise<void> {
  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
}

/**
 * Stable equality for two `selection` JSON values: deep-equal on a canonical
 * key-sorted serialization, so `{a,b}` and `{b,a}` dedupe to the same line.
 */
export function selectionsEqual(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
