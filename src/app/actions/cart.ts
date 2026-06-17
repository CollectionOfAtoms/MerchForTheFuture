"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { resolveCartForWrite, resolveCartForRead } from "@/lib/cart/request";
import { addItem, cartItemCount, findOwnedItem, setItemQuantity, removeItem } from "@/lib/cart/cart";
import { validateApparelSelection, validatePrintSelection } from "@/lib/cart/validators";
import { getApparelListingDetail, getApparelListingOwnership } from "@/lib/apparel/detail";
import { quotePrintUnitPrice } from "@/lib/print/quote";
import type { PrintProduct } from "@/lib/print/listing";

export type AddToCartResult = { error: string } | { success: true; count: number };

export interface AddApparelInput {
  itemKind: "APPAREL";
  apparelListingId: string;
  selection: { colorId: string; sizeLabel: string };
  quantity?: number;
}

export interface AddPrintInput {
  itemKind: "PRINT";
  listingId: string;
  prodigiSku: string;
  attributes?: Record<string, string>;
  quantity?: number;
}

export type AddToCartInput = AddApparelInput | AddPrintInput;

/**
 * Add an item to the visitor's cart (US-MFTF-11.2 — apparel; US-MFTF-11.3 extends
 * this with prints). Validates against the normalized read-shape so it never
 * branches on sourcing mode or provider. Returns the updated total item count so
 * the client can refresh the nav badge without a full reload.
 */
export async function addToCartAction(input: AddToCartInput): Promise<AddToCartResult> {
  if (input.itemKind === "APPAREL") return addApparelToCart(input);
  if (input.itemKind === "PRINT") return addPrintToCart(input);
  return { error: "Unsupported item kind." };
}

async function addApparelToCart(input: AddApparelInput): Promise<AddToCartResult> {
  const shape = validateApparelSelection(input.selection);
  if (!shape.valid) return { error: shape.error };
  const { colorId, sizeLabel } = shape.value;

  // Purchasable only when ACTIVE: UNLISTED listings are previewable by direct
  // link but must be rejected here. (getApparelListingDetail intentionally also
  // returns UNLISTED listings for preview, so status is checked separately.)
  const ownership = await getApparelListingOwnership(input.apparelListingId);
  if (!ownership || ownership.status !== "ACTIVE") {
    return { error: "This item is not available for purchase." };
  }

  const detail = await getApparelListingDetail(input.apparelListingId);
  if (!detail) return { error: "This item is not available for purchase." };

  // Validate the chosen colour/size against the normalized offered set. The
  // offered-colour identity is the colour name (works for both designed and
  // referenced listings — see src/lib/cart/validators.ts).
  if (!detail.colors.some((c) => c.name === colorId)) {
    return { error: "That color is not available for this item." };
  }
  if (!detail.sizes.includes(sizeLabel)) {
    return { error: "That size is not available for this item." };
  }

  const cart = await resolveCartForWrite();
  await addItem(cart.id, {
    itemKind: "APPAREL",
    apparelListingId: input.apparelListingId,
    selection: { colorId, sizeLabel },
    quantity: input.quantity ?? 1,
  });

  revalidatePath("/", "layout");
  const count = await cartItemCount(cart.id);
  return { success: true, count };
}

async function addPrintToCart(input: AddPrintInput): Promise<AddToCartResult> {
  const listing = await prisma.originalListing.findUnique({ where: { id: input.listingId } });
  // Prints are independent of the original's sold state, so we don't require
  // ACTIVE; we only require prints be enabled and the listing not retired.
  if (!listing || !listing.availableForPrint) {
    return { error: "Prints are not available for this artwork." };
  }
  if (listing.status === "ARCHIVED" || listing.status === "CANCELLED") {
    return { error: "This item is not available for purchase." };
  }

  // The seller-curated printProducts set is already aspect-ratio filtered
  // (US-15.6), so membership is the authoritative SKU validity check.
  const products = (listing.printProducts as unknown as PrintProduct[] | null) ?? [];
  if (!products.some((p) => p.sku === input.prodigiSku)) {
    return { error: "That print option is not available for this artwork." };
  }

  const attributes = input.attributes ?? {};
  let quotedUnitPrice: number;
  try {
    quotedUnitPrice = await quotePrintUnitPrice({ sku: input.prodigiSku, attributes });
  } catch {
    return { error: "We couldn't price this print right now. Please try again." };
  }

  const selection = { prodigiSku: input.prodigiSku, attributes, quotedUnitPrice };
  const shape = validatePrintSelection(selection);
  if (!shape.valid) return { error: shape.error };

  const cart = await resolveCartForWrite();
  await addItem(cart.id, {
    itemKind: "PRINT",
    listingId: input.listingId,
    selection,
    // De-dupe on SKU + attributes only; the volatile quotedUnitPrice must not
    // split an otherwise-identical print into two lines.
    dedupeSelection: { prodigiSku: input.prodigiSku, attributes },
    quantity: input.quantity ?? 1,
  });

  revalidatePath("/", "layout");
  const count = await cartItemCount(cart.id);
  return { success: true, count };
}

export type MutateCartResult = { error: string } | { success: true; count: number };

/**
 * Set a cart line's quantity (min 1), guarded by ownership: the item must belong
 * to the requesting visitor's cart (US-MFTF-11.4).
 */
export async function updateCartItemAction(cartItemId: string, quantity: number): Promise<MutateCartResult> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Quantity must be at least 1." };
  }
  const cart = await resolveCartForRead();
  if (!cart) return { error: "Cart not found." };
  const owned = await findOwnedItem(cart.id, cartItemId);
  if (!owned) return { error: "Item not found in your cart." };

  await setItemQuantity(cartItemId, quantity);
  revalidatePath("/", "layout");
  revalidatePath("/cart");
  return { success: true, count: await cartItemCount(cart.id) };
}

/** Remove a cart line, guarded by ownership (US-MFTF-11.4). */
export async function removeCartItemAction(cartItemId: string): Promise<MutateCartResult> {
  const cart = await resolveCartForRead();
  if (!cart) return { error: "Cart not found." };
  const owned = await findOwnedItem(cart.id, cartItemId);
  if (!owned) return { error: "Item not found in your cart." };

  await removeItem(cartItemId);
  revalidatePath("/", "layout");
  revalidatePath("/cart");
  return { success: true, count: await cartItemCount(cart.id) };
}
