import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// US-MFTF-19.3 — dark-theme TOKENS only (the toggle is 19.4). Color assertions are
// inherently weak: we smoke-test the token surface in globals.css — that a full
// semantic token set is registered as Tailwind v4 theme tokens, that a single
// root mechanism overrides them for dark, and that a known token resolves to a
// different (dark) value under .dark. WCAG-AA contrast and "media unaffected" are
// flagged in the PR as manual QA (not auto-testable here).

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf-8");

// The semantic chrome tokens the theme must define.
const SEMANTIC_TOKENS = [
  "--color-bg",
  "--color-surface",
  "--color-text",
  "--color-muted",
  "--color-border",
  "--color-accent",
];

describe("globals.css dark-mode tokens", () => {
  it("registers the full semantic token set inside @theme inline {}", () => {
    const themeBlock = css.slice(css.indexOf("@theme inline"), css.indexOf("}", css.indexOf("@theme inline")) + 1);
    for (const token of SEMANTIC_TOKENS) {
      expect(themeBlock, `missing ${token} in @theme inline`).toContain(token);
    }
  });

  it("defines a single root-level dark mechanism (.dark / [data-theme=\"dark\"])", () => {
    expect(css).toMatch(/\.dark|\[data-theme=["']dark["']\]/);
  });

  it("overrides a known token to a different dark value than the light default", () => {
    // Light default lives on :root; dark override under the dark selector. Pull the
    // page-background variable from each and assert they differ.
    const lightMatch = css.match(/:root\s*\{[^}]*?--bg:\s*([^;]+);/s);
    const darkMatch = css.match(/(?:\.dark|\[data-theme=["']dark["']\])[^{]*\{[^}]*?--bg:\s*([^;]+);/s);
    expect(lightMatch, "no light --bg on :root").toBeTruthy();
    expect(darkMatch, "no dark --bg override").toBeTruthy();
    expect(lightMatch![1].trim()).not.toBe(darkMatch![1].trim());
  });
});
