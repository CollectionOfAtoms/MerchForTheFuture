/**
 * Fallback sizing for DESIGNED (Prodigi) apparel.
 *
 * The per-blank source of truth is the provider, synced into ProductTypeSizeOption
 * rows by `syncDesignedSizesFromProdigi()` (src/lib/apparel/sync-sizes.ts) and read
 * by `toSizes` (src/lib/apparel/detail.ts). This module only supplies the fallback
 * used when a blank hasn't been synced yet (or the provider returned nothing), so a
 * listing always stays orderable — the bug this fixes was an empty size list
 * disabling "Add to cart".
 */

/** Standard unisex apparel run; the fallback until a blank is synced from Prodigi. */
export const DEFAULT_APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/**
 * Canonical size catalog. Providers spell sizes inconsistently (Prodigi returns
 * lowercase "m", "2xl"; Teemill returns "M", "XXL") and in arbitrary order. We map
 * any provider spelling to a single display label + a sort rank so sizes always
 * render the same way, smallest → largest.
 */
const SIZE_CATALOG: { label: string; rank: number; aliases: string[] }[] = [
  { label: "XXS", rank: 0, aliases: ["xxs"] },
  { label: "XS", rank: 1, aliases: ["xs"] },
  { label: "S", rank: 2, aliases: ["s", "small"] },
  { label: "M", rank: 3, aliases: ["m", "medium"] },
  { label: "L", rank: 4, aliases: ["l", "large"] },
  { label: "XL", rank: 5, aliases: ["xl", "1xl"] },
  { label: "XXL", rank: 6, aliases: ["xxl", "2xl"] },
  { label: "3XL", rank: 7, aliases: ["3xl", "xxxl"] },
  { label: "4XL", rank: 8, aliases: ["4xl", "xxxxl"] },
  { label: "5XL", rank: 9, aliases: ["5xl"] },
];

const SIZE_BY_ALIAS = new Map<string, { label: string; rank: number }>();
for (const e of SIZE_CATALOG) {
  for (const a of e.aliases) SIZE_BY_ALIAS.set(a, { label: e.label, rank: e.rank });
}

/** Unknown sizes (e.g. "One Size") sort after the standard run, preserving input order. */
const UNKNOWN_RANK = 1000;

function lookupSize(raw: string): { label: string; rank: number } {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  return SIZE_BY_ALIAS.get(key) ?? { label: raw.trim().toUpperCase(), rank: UNKNOWN_RANK };
}

/** Canonical display label for any provider size spelling ("m" → "M", "2xl" → "XXL"). */
export function canonicalSizeLabel(raw: string): string {
  return lookupSize(raw).label;
}

/** Sort rank for a size (smallest → largest); unknown sizes sort to the end. */
export function sizeRank(raw: string): number {
  return lookupSize(raw).rank;
}

/** Canonicalise + de-dupe + sort a list of provider sizes smallest → largest. */
export function normalizeSizes(raw: string[]): string[] {
  const seen = new Map<string, number>();
  for (const r of raw) {
    const { label, rank } = lookupSize(r);
    if (!seen.has(label)) seen.set(label, rank);
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label);
}

/**
 * Resolve fallback sizes for a designed blank. (Per-blank provider data lives in
 * ProductTypeSizeOption rows; this is only hit when those are absent.) The
 * `providerSkuBase` is accepted for future per-blank fallbacks but currently all
 * blanks share the standard run.
 */
export function getApparelSizesForBlank(_providerSkuBase: string | null | undefined): string[] {
  return [...DEFAULT_APPAREL_SIZES];
}
