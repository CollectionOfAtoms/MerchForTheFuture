import { describe, it, expect } from "vitest";
import { resolveTheme, THEME_COOKIE, themeInitScript } from "@/lib/theme/theme";

// US-MFTF-19.4 — theme resolution precedence: a stored manual choice (cookie) wins
// over OS preference, which wins over the light default. Pure function, mirrors the
// buyer-currency resolver split (currency.ts pure / buyer-currency.ts server I/O).

describe("resolveTheme", () => {
  it("uses the cookie when a manual choice is stored (over OS)", () => {
    expect(resolveTheme({ cookie: "dark", prefersDark: false })).toBe("dark");
    expect(resolveTheme({ cookie: "light", prefersDark: true })).toBe("light");
  });

  it("falls back to OS preference when no manual choice is stored", () => {
    expect(resolveTheme({ cookie: null, prefersDark: true })).toBe("dark");
    expect(resolveTheme({ cookie: null, prefersDark: false })).toBe("light");
  });

  it("defaults to light when neither cookie nor OS preference is available", () => {
    expect(resolveTheme({})).toBe("light");
    expect(resolveTheme({ cookie: "bogus" })).toBe("light");
  });
});

describe("themeInitScript (no-flash inline script)", () => {
  it("reads the theme cookie name and applies the dark attribute before paint", () => {
    expect(themeInitScript).toContain(THEME_COOKIE);
    expect(themeInitScript).toMatch(/prefers-color-scheme/);
    expect(themeInitScript).toMatch(/data-theme|classList/);
  });
});
