import { prisma } from "@/lib/db";
import { getExchangeRate, getSupportedCurrencies } from "./currency";

/**
 * Display FX rates (US-5.4). Refreshed at least daily by a cron and read for
 * buyer-facing local-currency DISPLAY only — checkout always settles in USD.
 * Base is USD (the store's listing currency).
 */
const BASE = "USD";

/** Fetch current rates from the live source and upsert one row per quote currency. */
export async function refreshExchangeRates(): Promise<{ refreshed: number; fetchedAt: Date }> {
  const fetchedAt = new Date();
  const quotes = getSupportedCurrencies();
  let refreshed = 0;
  for (const quote of quotes) {
    const rate = quote === BASE ? 1 : await getExchangeRate(BASE, quote);
    await prisma.exchangeRate.upsert({
      where: { baseCurrency_quoteCurrency: { baseCurrency: BASE, quoteCurrency: quote } },
      update: { rate, fetchedAt },
      create: { baseCurrency: BASE, quoteCurrency: quote, rate },
    });
    refreshed++;
  }
  return { refreshed, fetchedAt };
}

/** A stored rate from `from` to `to`, or null if not cached yet. */
export async function getStoredRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  const row = await prisma.exchangeRate.findUnique({
    where: { baseCurrency_quoteCurrency: { baseCurrency: from, quoteCurrency: to } },
  });
  return row ? Number(row.rate) : null;
}
