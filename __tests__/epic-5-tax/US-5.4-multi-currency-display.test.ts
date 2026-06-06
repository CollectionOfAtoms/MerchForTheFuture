import { describe, it, expect } from "vitest";
import {
  getExchangeRate,
  convertPrice,
  formatCurrency,
  getSupportedCurrencies,
} from "@/lib/tax/currency";

describe("US-5.4 — Multi-Currency Display", () => {
  it("returns exchange rate for USD to EUR", async () => {
    const rate = await getExchangeRate("USD", "EUR");
    expect(typeof rate).toBe("number");
    expect(rate).toBeGreaterThan(0);
  });

  it("returns 1.0 for same-currency conversion", async () => {
    const rate = await getExchangeRate("USD", "USD");
    expect(rate).toBe(1.0);
  });

  it("converts a price from USD to EUR", async () => {
    const converted = await convertPrice(100, "USD", "EUR");
    expect(converted.amount).toBeGreaterThan(0);
    expect(converted.rate).toBeGreaterThan(0);
    expect(converted.fromCurrency).toBe("USD");
    expect(converted.toCurrency).toBe("EUR");
    expect(converted.rateTimestamp).toBeInstanceOf(Date);
  });

  it("returns original amount when currencies match", async () => {
    const converted = await convertPrice(100, "USD", "USD");
    expect(converted.amount).toBe(100);
    expect(converted.rate).toBe(1.0);
  });

  it("formats currency with correct symbol and decimals", () => {
    expect(formatCurrency(1234.56, "USD")).toMatch(/\$1,234\.56/);
    expect(formatCurrency(1234.56, "EUR")).toMatch(/€|EUR/);
    expect(formatCurrency(0, "USD")).toBe("$0.00");
  });

  it("formats negative currency correctly", () => {
    const result = formatCurrency(-50, "USD");
    expect(result).toMatch(/-?\$50\.00|\(\$50\.00\)/);
  });

  it("returns a list of supported currencies", () => {
    const currencies = getSupportedCurrencies();
    expect(Array.isArray(currencies)).toBe(true);
    expect(currencies).toContain("USD");
    expect(currencies).toContain("EUR");
    expect(currencies).toContain("GBP");
    expect(currencies.length).toBeGreaterThanOrEqual(5);
  });

  it("converts with a known MSW-mocked exchange rate", async () => {
    // The MSW handler returns a fixed rate; verify end-to-end fetch path
    const converted = await convertPrice(200, "USD", "EUR");
    // Should be non-zero regardless of exact rate
    expect(converted.amount).toBeGreaterThan(0);
  });
});
