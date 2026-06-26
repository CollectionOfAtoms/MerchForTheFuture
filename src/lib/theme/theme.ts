// Pure, Prisma-free theme resolution + the no-flash init script (US-MFTF-19.4).
// Mirrors the buyer-currency split: this module is import-safe in a client bundle
// and in node tests; the server cookie read lives in ./cookie.ts.

export const THEME_COOKIE = "mftf_theme";
/** One year — the manual choice persists across visits. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Theme = "light" | "dark";

/**
 * Resolve the active theme. Precedence: a stored manual choice (cookie) > the OS
 * `prefers-color-scheme` > the light default. OS preference only governs when no
 * manual choice is stored.
 */
export function resolveTheme(input: { cookie?: string | null; prefersDark?: boolean }): Theme {
  if (input.cookie === "dark") return "dark";
  if (input.cookie === "light") return "light";
  return input.prefersDark ? "dark" : "light";
}

/**
 * Inline script applied before hydration so the correct theme paints with no
 * flash. It reproduces resolveTheme's precedence on the client for the first-visit
 * case the server can't see (OS preference): cookie > prefers-color-scheme > light.
 * For returning visitors the server already sets the attribute from the cookie, so
 * this only ever confirms or fills in the OS default. Kept as a string so it can be
 * injected via dangerouslySetInnerHTML and unit-tested.
 */
export const themeInitScript = `(function(){try{` +
  `var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);` +
  `var t=m?m[1]:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');` +
  `var r=document.documentElement;` +
  `if(t==='dark')r.classList.add('dark');else r.classList.remove('dark');` +
  `r.setAttribute('data-theme',t);` +
  `}catch(e){}})();`;
