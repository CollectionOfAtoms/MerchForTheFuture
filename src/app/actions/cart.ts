"use server";

import { revalidatePath } from "next/cache";
import { resolveCartForWrite } from "@/lib/cart/request";
import { addItem, cartItemCount } from "@/lib/cart/cart";
import { validateApparelSelection } from "@/lib/cart/validators";
import { getApparelListingDetail, getApparelListingOwnership } from "@/lib/apparel/detail";

export type AddToCartResult = { error: string } | { success: true; count: number };

export interface AddApparelInput {
  itemKind: "APPAREL";
  apparelListingId: string;
  selection: { colorId: string; sizeLabel: string };
  quantity?: number;
}

export type AddToCartInput = AddApparelInput;

/**
 * Add an item to the visitor's cart (US-MFTF-11.2 — apparel; US-MFTF-11.3 extends
 * this with prints). Validates against the normalized read-shape so it never
 * branches on sourcing mode or provider. Returns the updated total item count so
 * the client can refresh the nav badge without a full reload.
 */
export async function addToCartAction(input: AddToCartInput): Promise<AddToCartResult> {
  if (input.itemKind === "APPAREL") {
    return addApparelToCart(input);
  }
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
