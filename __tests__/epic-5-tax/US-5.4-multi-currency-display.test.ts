import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDatabase, prisma } from "../helpers/db";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { formatCurrency, getSupportedCurrencies, currencyForCountry, resolveBuyerCurrency, convertWithRate } =
  await import("@/lib/tax/currency");
const { refreshExchangeRates, getStoredRate, getStoredRateOrSeed } = await import("@/lib/tax/fx");
const { updateCurrencyPreferenceAction } = await import("@/app/actions/account");
const { auth } = await import("@/auth");

function authAs(userId: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, roles: ["BUYER"] } } as never);
}
function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("US-5.4 — Multi-Currency Display", () => {
  beforeEach(async () => { await resetDatabase(); vi.clearAllMocks(); });
  afterEach(async () => resetDatabase());

  describe("formatting + pure helpers", () => {
    it("formats currency with the right symbol/decimals", () => {
      expect(formatCurrency(1234.56, "USD")).toMatch(/\$1,234\.56/);
      expect(formatCurrency(1234.56, "EUR")).toMatch(/€|EUR/);
      expect(formatCurrency(0, "USD")).toBe("$0.00");
    });

    it("lists supported currencies including USD/EUR/GBP", () => {
      const c = getSupportedCurrencies();
      expect(c).toContain("USD");
      expect(c).toContain("EUR");
      expect(c).toContain("GBP");
      expect(c.length).toBeGreaterThanOrEqual(5);
    });

    it("maps country → display currency (default USD)", () => {
      expect(currencyForCountry("GB")).toBe("GBP");
      expect(currencyForCountry("de")).toBe("EUR");
      expect(currencyForCountry("US")).toBe("USD");
      expect(currencyForCountry("ZZ")).toBe("USD");
      expect(currencyForCountry(null)).toBe("USD");
    });

    it("converts a USD amount with a known rate (2dp)", () => {
      expect(convertWithRate(100, 0.92)).toBe(92);
      expect(convertWithRate(19.99, 0.79)).toBeCloseTo(15.79, 2);
    });
  });

  describe("getBuyerCurrency precedence (resolveBuyerCurrency)", () => {
    it("prefers the account override above all", () => {
      expect(resolveBuyerCurrency({ pref: "EUR", cookie: "GBP", country: "US" })).toBe("EUR");
    });
    it("falls back to the cookie, then geo, then USD", () => {
      expect(resolveBuyerCurrency({ pref: null, cookie: "GBP", country: "US" })).toBe("GBP");
      expect(resolveBuyerCurrency({ pref: null, cookie: null, country: "GB" })).toBe("GBP");
      expect(resolveBuyerCurrency({ pref: null, cookie: null, country: null })).toBe("USD");
    });
    it("ignores an unsupported value at any level", () => {
      expect(resolveBuyerCurrency({ pref: "XYZ", cookie: "GBP", country: "US" })).toBe("GBP");
    });
  });

  describe("daily FX refresh (cron lib)", () => {
    it("upserts stored rates from the live source, readable via getStoredRate", async () => {
      const result = await refreshExchangeRates();
      expect(result.refreshed).toBeGreaterThanOrEqual(5);

      const eur = await getStoredRate("USD", "EUR");
      expect(eur).toBeCloseTo(0.92, 2); // MSW fixture
      expect(await getStoredRate("USD", "USD")).toBe(1);
      // Idempotent: a second refresh updates rather than duplicates.
      await refreshExchangeRates();
      expect(await prisma.exchangeRate.count({ where: { baseCurrency: "USD", quoteCurrency: "EUR" } })).toBe(1);
    });

    it("returns null for an uncached pair", async () => {
      expect(await getStoredRate("USD", "EUR")).toBeNull();
    });

    it("lazily seeds the cache on a miss (getStoredRateOrSeed), then reads cached", async () => {
      expect(await prisma.exchangeRate.count()).toBe(0);
      const rate = await getStoredRateOrSeed("USD", "EUR");
      expect(rate).toBeCloseTo(0.92, 2); // fetched + upserted from the MSW fixture
      expect(await prisma.exchangeRate.count()).toBeGreaterThan(0);
      // Identity pair never needs a fetch.
      expect(await getStoredRateOrSeed("USD", "USD")).toBe(1);
    });
  });

  describe("account currency preference", () => {
    it("persists the chosen currency to the user's preferences", async () => {
      const buyer = await prisma.user.create({ data: { email: `b-${crypto.randomUUID()}@t.com`, roles: ["BUYER"] } });
      authAs(buyer.id);
      const result = await updateCurrencyPreferenceAction(fd({ currency: "GBP" }));
      expect("success" in result && result.success).toBe(true);
      const fresh = await prisma.user.findUnique({ where: { id: buyer.id } });
      const pref = (fresh!.loginMetadata as { preferences?: { currency?: string } }).preferences?.currency;
      expect(pref).toBe("GBP");
    });

    it("rejects an unsupported currency", async () => {
      const buyer = await prisma.user.create({ data: { email: `b-${crypto.randomUUID()}@t.com`, roles: ["BUYER"] } });
      authAs(buyer.id);
      const result = await updateCurrencyPreferenceAction(fd({ currency: "XYZ" }));
      expect("error" in result).toBe(true);
    });
  });
});
