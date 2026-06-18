/**
 * Designed (Prodigi) apparel colours arrive from the provider as lowercase NAME
 * strings only — no hex, no swatch image (verified against the live Prodigi product
 * API, 2026-06-17: variants[].attributes.color = "navy blue", "natural", etc.).
 *
 * To render colours as actual swatches we map those names → an approximate hex at
 * read time (no DB column needed). Unknown names return null; callers fall back to
 * a neutral swatch (or an admin-uploaded colorImageUrl). Hexes are approximate
 * display values, not brand-exact — refine as needed, or upload a swatch image for
 * a precise blank.
 */

/** Normalise a provider colour name to a lookup key (lowercase, single-spaced). */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const COLOR_HEX: Record<string, string> = {
  // ── Observed on Prodigi (Bella + Canvas) ──────────────────────────────────
  white: "#ffffff",
  black: "#111111",
  "navy blue": "#1f2a44",
  navy: "#1f2a44",
  "baby blue": "#a9c7e8",
  natural: "#efe7d3",
  pink: "#f4a7c0",
  red: "#c8102e",
  // ── Common apparel colours (broad coverage) ───────────────────────────────
  grey: "#9ca3af",
  gray: "#9ca3af",
  "heather grey": "#b8bcc2",
  "heather gray": "#b8bcc2",
  "sport grey": "#b0b3b8",
  "athletic heather": "#b8bcc2",
  charcoal: "#36454f",
  "dark grey": "#4b5563",
  ash: "#e5e4e2",
  cream: "#f5f0e1",
  ivory: "#fffff0",
  sand: "#d8c69a",
  tan: "#d2b48c",
  brown: "#5b4636",
  maroon: "#5a1a2b",
  burgundy: "#6d1f33",
  orange: "#e8601c",
  gold: "#d4af37",
  mustard: "#d9a300",
  yellow: "#f4d03f",
  green: "#2e7d32",
  "forest green": "#1f3d2b",
  "kelly green": "#3aaa35",
  "military green": "#4b5320",
  olive: "#6b6a3a",
  teal: "#1d7874",
  turquoise: "#3bb9b0",
  blue: "#2453b8",
  "royal blue": "#1d3fb0",
  royal: "#1d3fb0",
  "light blue": "#a9c7e8",
  purple: "#5b2a86",
  "heather purple": "#7a5a93",
};

/** Approximate display hex for a provider colour name, or null if unknown. */
export function colorNameToHex(name: string | null | undefined): string | null {
  if (!name) return null;
  return COLOR_HEX[normalize(name)] ?? null;
}
