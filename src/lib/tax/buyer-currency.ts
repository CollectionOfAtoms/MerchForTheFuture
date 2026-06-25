import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { resolveBuyerCurrency } from "./currency";
import { getStoredRateOrSeed } from "./fx";

/** Cookie that remembers a guest/buyer's chosen or detected display currency. */
export const CURRENCY_COOKIE = "mftf_currency";

/**
 * The buyer's display currency (US-5.4): account preference → cookie → geo header
 * (x-vercel-ip-country) → USD. Server-only (reads next/headers + prisma).
 */
export async function getBuyerCurrency(userId?: string | null): Promise<string> {
  let pref: string | null = null;
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { loginMetadata: true } });
    pref = (user?.loginMetadata as { preferences?: { currency?: string } } | null)?.preferences?.currency ?? null;
  }
  const cookie = (await cookies()).get(CURRENCY_COOKIE)?.value ?? null;
  const country = (await headers()).get("x-vercel-ip-country");
  return resolveBuyerCurrency({ pref, cookie, country });
}

/**
 * Display context for a server page: the buyer's currency + the stored USD→currency
 * rate (null when USD or not cached). Components convert with this and show USD as
 * secondary; checkout is unaffected (always USD).
 */
export async function getDisplayCurrency(userId?: string | null): Promise<{ currency: string; rate: number | null }> {
  const currency = await getBuyerCurrency(userId);
  const rate = currency === "USD" ? null : await getStoredRateOrSeed("USD", currency);
  return { currency, rate };
}
