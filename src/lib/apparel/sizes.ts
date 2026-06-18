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
 * Resolve fallback sizes for a designed blank. (Per-blank provider data lives in
 * ProductTypeSizeOption rows; this is only hit when those are absent.) The
 * `providerSkuBase` is accepted for future per-blank fallbacks but currently all
 * blanks share the standard run.
 */
export function getApparelSizesForBlank(_providerSkuBase: string | null | undefined): string[] {
  return [...DEFAULT_APPAREL_SIZES];
}
