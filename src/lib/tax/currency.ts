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
