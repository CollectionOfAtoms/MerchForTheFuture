/**
 * Guest-cart merge-on-authentication wiring (US-MFTF-11.5).
 *
 * Deliberately imports no `@/auth` so it can be called from the NextAuth
 * `events.signIn` callback (in `src/auth.ts`) without an import cycle. The event
 * fires only on a *successful* sign-in or sign-up, so the merge never runs for a
 * failed login attempt.
 */
import { getGuestToken, clearGuestToken } from "@/lib/cart/cookies";
import { mergeGuestCartIntoUser } from "@/lib/cart/cart";

/**
 * If the visitor has a guest cart cookie, merge that cart into `userId`'s cart
 * and clear the cookie. No-op when there is no guest token. Idempotent (the merge
 * deletes the guest cart row).
 */
export async function mergeGuestCartOnAuth(userId: string): Promise<void> {
  const token = await getGuestToken();
  if (!token) return;
  await mergeGuestCartIntoUser(token, userId);
  await clearGuestToken();
}
