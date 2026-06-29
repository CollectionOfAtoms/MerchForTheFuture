import { cookies } from "next/headers";
import { THEME_COOKIE, type Theme } from "./theme";

/**
 * The stored manual theme choice (US-MFTF-19.4), read server-side so the root
 * layout can set the theme attribute before hydration for a no-flash first paint.
 * Returns null when no manual choice is stored (first visit) — the OS preference
 * then governs via the inline init script. Mirrors the guest-cart/buyer-currency
 * cookie pattern. Not httpOnly: the toggle + init script read/write it client-side.
 */
export async function getThemeCookie(): Promise<Theme | null> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === "dark" || value === "light" ? value : null;
}
