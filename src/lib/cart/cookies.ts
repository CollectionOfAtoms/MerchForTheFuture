/**
 * Guest-cart cookie I/O (US-MFTF-11.2). Isolated behind this thin wrapper so the
 * cart server actions can be unit-tested by mocking `@/lib/cart/cookies` without
 * pulling in `next/headers` (unavailable in the node test environment).
 *
 * The token is stored in an httpOnly, secure, sameSite=lax cookie with a 30-day
 * lifetime — matching the US-MFTF-11.6 guest-cart staleness window.
 */
import { cookies } from "next/headers";

export const GUEST_CART_COOKIE = "mftf_cart";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export async function getGuestToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(GUEST_CART_COOKIE)?.value ?? null;
}

export async function setGuestToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(GUEST_CART_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  });
}

export async function clearGuestToken(): Promise<void> {
  const store = await cookies();
  store.set(GUEST_CART_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Generate a fresh, unguessable guest-cart token. */
export function generateGuestToken(): string {
  return crypto.randomUUID();
}
