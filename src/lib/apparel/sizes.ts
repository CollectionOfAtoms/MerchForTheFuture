/**
 * Provider-sourced sizes for DESIGNED (Prodigi) apparel, keyed by a product type's
 * `providerSkuBase` (the blank). This mirrors the verified-static `PRINT_CATALOG`
 * pattern in `src/lib/print/listing.ts`: the source of truth is the provider, but
 * we cache a verified snapshot in code (refresh via `scripts/probe-prodigi-catalog.ts`)
 * rather than making a live call on every product render.
 *
 * Sizes are per-blank on purpose — a tee, a hoodie, a tote and a mug have different
 * (or no) size runs — so future product types don't inherit a tee's sizing.
 *
 * Blanks not yet in the catalog fall back to `DEFAULT_APPAREL_SIZES` so the listing
 * stays orderable (the bug this fixes: an empty size list disabled "Add to cart").
 */

/** Standard unisex apparel run; the fallback until a blank is probed. */
export const DEFAULT_APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/**
 * Verified per-blank size runs. Populate entries from a probe of the live Prodigi
 * catalog (see scripts/probe-prodigi-catalog.ts) — e.g.
 *   "RNA1": ["XS","S","M","L","XL","XXL"],   // unisex tee
 *   "TOTE": [],                               // sizeless
 * An empty array means "no size choice" (sizeless product); `undefined` (absent)
 * means "not probed yet" and falls back to the default run.
 */
const APPAREL_SIZE_CATALOG: Record<string, readonly string[]> = {
  // Populate via the probe script. Until then every blank uses DEFAULT_APPAREL_SIZES.
};

/**
 * Resolve the offered sizes for a designed blank. Returns the verified per-blank run
 * when known, otherwise the standard default run. A blank explicitly catalogued as
 * sizeless (empty array) returns `[]`.
 */
export function getApparelSizesForBlank(providerSkuBase: string | null | undefined): string[] {
  if (providerSkuBase && providerSkuBase in APPAREL_SIZE_CATALOG) {
    return [...APPAREL_SIZE_CATALOG[providerSkuBase]];
  }
  return [...DEFAULT_APPAREL_SIZES];
}
