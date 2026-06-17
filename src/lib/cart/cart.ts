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
  /**
   * Optional subset of `selection` used for de-duplication matching. Defaults to
   * the full `selection`. Prints pass `{ prodigiSku, attributes }` here so an
   * identical print de-dupes by SKU + attributes, ignoring the volatile
   * display-only `quotedUnitPrice` snapshot (US-MFTF-11.3).
   */
  dedupeSelection?: Prisma.InputJsonValue;
}

/**
 * Add an item to a cart, deduplicating on identical
 * (itemKind, listing reference, dedupe selection): a matching row has its quantity
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

  // Look for an identical existing line (same kind, same listing ref, matching
  // dedupe selection) and merge into it.
  const dedupe = input.dedupeSelection ?? input.selection;
  const dedupeKeys = Object.keys(dedupe as Record<string, unknown>);
  const candidates = await prisma.cartItem.findMany({
    where: { cartId, itemKind: input.itemKind, apparelListingId, listingId },
  });
  const match = candidates.find((c) => selectionsEqual(projectKeys(c.selection, dedupeKeys), dedupe));

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

// ── Normalized cart view (US-MFTF-11.4) ──────────────────────────────────────

export interface CartLineItem {
  id: string;
  kind: CartItemKind;
  title: string;
  /** Human-readable selection (e.g. "White · M" or "Fine Art Paper · 16x24"). */
  selectionSummary: string;
  thumbnailUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface CartView {
  items: CartLineItem[];
  subtotal: number;
  itemCount: number;
}

const MATERIAL_LABELS: Record<string, string> = {
  FAP: "Fine Art Paper",
  CAN: "Stretched Canvas",
};

/** Derive a buyer-facing "material · size" summary from a Prodigi SKU. */
function printSummary(sku: string): string {
  const parts = sku.split("-");
  const material = MATERIAL_LABELS[parts[1]] ?? parts[1] ?? "Print";
  const size = (parts[2] ?? "").replace(/X/i, "x");
  return size ? `${material} · ${size}` : material;
}

/**
 * Normalized, buyer-facing projection of a cart's line items (US-MFTF-11.4).
 * Apparel rows resolve title/price/thumbnail from the listing without branching
 * on sourcing mode or provider; print rows use the artwork title/thumbnail and
 * the display-only `quotedUnitPrice` snapshot stored on the line.
 */
export async function getCartView(cartId: string): Promise<CartView> {
  const items = await prisma.cartItem.findMany({
    where: { cartId },
    orderBy: { addedAt: "asc" },
    include: {
      apparelListing: {
        select: {
          title: true,
          retailPrice: true,
          images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 },
          referencedVariants: { orderBy: { id: "asc" }, take: 1 },
        },
      },
      originalListing: {
        select: {
          artwork: {
            select: {
              title: true,
              images: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }], take: 1 },
            },
          },
        },
      },
    },
  });

  const lines: CartLineItem[] = items.map((item) => {
    if (item.itemKind === "APPAREL") {
      const listing = item.apparelListing;
      const sel = item.selection as { colorId?: string; sizeLabel?: string };
      const img = listing?.images[0];
      const thumbnailUrl =
        img?.gridUrl ?? img?.displayUrl ?? img?.originalUrl ?? listing?.referencedVariants[0]?.mockupUrl ?? null;
      const unitPrice = listing ? Number(listing.retailPrice) : 0;
      const quantity = item.quantity;
      return {
        id: item.id,
        kind: "APPAREL",
        title: listing?.title ?? "Apparel",
        selectionSummary: [sel.colorId, sel.sizeLabel].filter(Boolean).join(" · "),
        thumbnailUrl,
        unitPrice,
        quantity,
        lineTotal: unitPrice * quantity,
      };
    }

    const sel = item.selection as { prodigiSku?: string; quotedUnitPrice?: number };
    const artwork = item.originalListing?.artwork;
    const img = artwork?.images[0];
    const thumbnailUrl = img?.gridUrl ?? img?.displayUrl ?? img?.url ?? null;
    const unitPrice = typeof sel.quotedUnitPrice === "number" ? sel.quotedUnitPrice : 0;
    const quantity = item.quantity;
    return {
      id: item.id,
      kind: "PRINT",
      title: artwork?.title ?? "Print",
      selectionSummary: printSummary(sel.prodigiSku ?? ""),
      thumbnailUrl,
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  return { items: lines, subtotal, itemCount };
}

/**
 * Resolve a cart item only if it belongs to `cartId` (ownership guard for the
 * update/remove actions). Returns null when the item does not exist or is owned
 * by a different cart.
 */
export async function findOwnedItem(cartId: string, cartItemId: string): Promise<CartItem | null> {
  const item = await prisma.cartItem.findUnique({ where: { id: cartItemId } });
  if (!item || item.cartId !== cartId) return null;
  return item;
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

/** Pick only `keys` from an object value (used for partial dedupe matching). */
function projectKeys(value: unknown, keys: string[]): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = source[k];
  return out;
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
