// US-18.4 — focal point for the square browse-grid crop.
// A seller-chosen focal point (each axis normalized to [0,1]) becomes the CSS
// object-position on the object-cover tile, so the important part of a non-square
// piece survives the crop. Null/undefined (legacy, unset) resolves to centre.

/** Clamp a number into [0,1]. */
function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Map a normalized focal point to a CSS `object-position` string
 * (e.g. `0.25, 0.75` → `"25% 75%"`). A null/undefined axis defaults to `0.5`,
 * so an unset focal point renders as `"50% 50%"` (centre).
 */
export function focalToObjectPosition(
  x: number | null | undefined,
  y: number | null | undefined,
): string {
  const px = Math.round(clamp01(x ?? 0.5) * 100);
  const py = Math.round(clamp01(y ?? 0.5) * 100);
  return `${px}% ${py}%`;
}
