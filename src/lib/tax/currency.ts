const EXCHANGE_RATE_API = "https://api.exchangerate-api.com/v4/latest";

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"];

interface ExchangeRateResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export interface ConvertedPrice {
  amount: number;
  rate: number;
  fromCurrency: string;
  toCurrency: string;
  rateTimestamp: Date;
}

export async function getExchangeRate(from: string, to: string): Promise<number> {
  if (from === to) return 1.0;

  const response = await fetch(`${EXCHANGE_RATE_API}/${from}`);
  const data = (await response.json()) as ExchangeRateResponse;
  const rate = data.rates[to];
  if (!rate) throw new Error(`No exchange rate found for ${from} → ${to}`);
  return rate;
}

export async function convertPrice(
  amount: number,
  from: string,
  to: string
): Promise<ConvertedPrice> {
  if (from === to) {
    return {
      amount,
      rate: 1.0,
      fromCurrency: from,
      toCurrency: to,
      rateTimestamp: new Date(),
    };
  }

  const rate = await getExchangeRate(from, to);
  return {
    amount: Math.round(amount * rate * 100) / 100,
    rate,
    fromCurrency: from,
    toCurrency: to,
    rateTimestamp: new Date(),
  };
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getSupportedCurrencies(): string[] {
  return [...SUPPORTED_CURRENCIES];
}

/** Country (ISO 3166-1 alpha-2) → display currency. Unmapped → USD. */
const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  JP: "JPY",
  // Eurozone (subset of common markets)
  IE: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR",
  BE: "EUR", AT: "EUR", PT: "EUR", FI: "EUR", GR: "EUR",
};

/** Map a buyer's country to a display currency (defaults to USD). */
export function currencyForCountry(country?: string | null): string {
  if (!country) return "USD";
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? "USD";
}

/** Convert a USD amount to a target currency using a known rate (2dp). */
export function convertWithRate(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate * 100) / 100;
}

/** The buyer's resolved display currency + stored USD→currency rate (US-5.4). */
export interface DisplayCurrency {
  currency: string;
  /** Stored USD→currency rate; null for USD or when not cached. */
  rate: number | null;
}

/**
 * Buyer-facing price (US-5.4). When a non-USD display currency + rate are known,
 * the converted local price is primary and USD is the secondary line; otherwise
 * USD only. Display-only — checkout always charges USD. Pure (client-safe).
 */
export function localizedPrice(
  amountUsd: number,
  display?: DisplayCurrency | null,
  maxFractionDigits = 0,
): { primary: string; secondary: string | null } {
  const fmt = (amt: number, cur: string) =>
    amt.toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: maxFractionDigits });
  if (!display || display.currency === "USD" || display.rate == null) {
    return { primary: fmt(amountUsd, "USD"), secondary: null };
  }
  return {
    primary: fmt(convertWithRate(amountUsd, display.rate), display.currency),
    secondary: fmt(amountUsd, "USD"),
  };
}

/**
 * Resolve the buyer's display currency by precedence (US-5.4): explicit account
 * preference → remembered cookie → geo-detected country → USD. Pure so it is easy
 * to test; the server wrapper (buyer-currency.ts) supplies the inputs.
 */
export function resolveBuyerCurrency(opts: {
  pref?: string | null;
  cookie?: string | null;
  country?: string | null;
}): string {
  const supported = new Set(SUPPORTED_CURRENCIES);
  const pick = (v?: string | null) => (v && supported.has(v) ? v : null);
  return pick(opts.pref) ?? pick(opts.cookie) ?? pick(currencyForCountry(opts.country)) ?? "USD";
}
