/**
 * Request-scoped cart resolution (US-MFTF-11.2). Bridges the session/guest-cookie
 * context to the pure cart core (`src/lib/cart/cart.ts`). Kept out of `cart.ts`
 * so that module stays free of `next/headers`/auth and remains node-testable.
 */
import { auth } from "@/auth";
import { getGuestToken, setGuestToken, generateGuestToken } from "@/lib/cart/cookies";
import { findOrCreateUserCart, findOrCreateGuestCart, cartItemCount } from "@/lib/cart/cart";
import { prisma } from "@/lib/db";
import type { Cart } from "@/generated/prisma/client";

async function sessionUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

/**
 * Resolve the visitor's cart for a *write*, creating one if needed. Authenticated
 * users get a find-or-create user cart; guests get a find-or-create cart keyed by
 * the cookie token, minting and setting a fresh httpOnly token when absent.
 */
export async function resolveCartForWrite(): Promise<Cart> {
  const userId = await sessionUserId();
  if (userId) return findOrCreateUserCart(userId);

  let token = await getGuestToken();
  if (!token) {
    token = generateGuestToken();
    await setGuestToken(token);
  }
  return findOrCreateGuestCart(token);
}

/**
 * Resolve the visitor's existing cart for a *read*, without creating anything or
 * mutating cookies. Returns null when the visitor has no cart yet.
 */
export async function resolveCartForRead(): Promise<Cart | null> {
  const userId = await sessionUserId();
  if (userId) return prisma.cart.findUnique({ where: { userId } });

  const token = await getGuestToken();
  if (!token) return null;
  return prisma.cart.findUnique({ where: { guestToken: token } });
}

/** Total item quantity for the current visitor's cart (the nav badge count). */
export async function getCartCountForRequest(): Promise<number> {
  const cart = await resolveCartForRead();
  return cart ? cartItemCount(cart.id) : 0;
}
