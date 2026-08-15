/**
 * Live per-variant availability for a DESIGNED Printify product type (US-MFTF-17.4).
 *
 * The catalog is cached as the FULL colour/size range (US-MFTF-17.2 syncs with
 * `?show-out-of-stock=1`). This reads the DEFAULT (no-flag) variants list — which
 * Printify scopes to what is *currently in stock* — to learn what is orderable right
 * now. A variant object carries no availability field, so "orderable now" is exactly
 * "appears in the default list".
 *
 * FAIL-OPEN: any error (or a non-200) returns `null`, meaning "could not determine —
 * treat everything as available", so a provider hiccup never blocks browsing or
 * checkout. This mirrors the Teemill `isOrderable` fallback in checkout revalidation.
 */
import { canonicalSizeLabel } from "@/lib/apparel/sizes";
import { printifyGet } from "@/lib/fulfillment/printify/client";

/** Stable key for a (colour, canonical size) combo. */
export function variantKey(color: string, size: string): string {
  return `${color}|${canonicalSizeLabel(size)}`;
}

interface PrintifyVariant {
  id?: number;
  options?: { color?: string; size?: string };
}

/**
 * The set of currently-orderable `${color}|${canonicalSize}` combos for a
 * (blueprint, print_provider) pair, or `null` if availability could not be read
 * (fail-open). NOTE: no `?show-out-of-stock=1` here — the default list IS the
 * in-stock list, which is the whole point.
 */
export async function getPrintifyAvailability(
  blueprintId: number,
  printProviderId: number,
): Promise<Set<string> | null> {
  try {
    const res = await printifyGet(
      `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { variants?: PrintifyVariant[] };
    const set = new Set<string>();
    for (const v of data.variants ?? []) {
      if (v.options?.color && v.options?.size) set.add(variantKey(v.options.color, v.options.size));
    }
    return set;
  } catch (e) {
    console.error(`[printify] availability read for blueprint ${blueprintId}/provider ${printProviderId} failed`, e);
    return null;
  }
}
