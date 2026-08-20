/**
 * Pure placement geometry for the seller apparel design-placement tool (US-MFTF-17.8),
 * the apparel analog of `print/crop-geometry`. Deliberately DOM-free so the clamping
 * and delta math are unit-testable; the React client (PrintifyPlacementPanel) only
 * translates pointer events into these calls.
 *
 * A `Placement` is normalized to EXACTLY Printify's positioned `print_areas` shape so
 * order-time wiring (US-MFTF-17.9) needs no translation:
 *   - `x`/`y`   the design's CENTRE as a fraction (0..1) of the print area
 *   - `scale`   the design's width as a fraction of the print-area width
 *   - `angle`   rotation in degrees, normalized to (-180, 180]
 */

export interface Placement {
  x: number;
  y: number;
  scale: number;
  angle: number;
}

/**
 * Provisional client-side scale clamp. // UNVERIFIED — Printify's own accepted
 * x/y/scale/angle ranges are unconfirmed without a live order (same caveat class as
 * the rest of this epic's order-shape items). This is a safety net preventing a
 * degenerate near-zero or absurdly oversized design, NOT a confirmed provider limit;
 * revisit once observed live (US-MFTF-17.3 / 17.9).
 */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 3.0;

function clamp(v: number, lo: number, hi: number): number {
  // NaN has no ordering, so collapse it to the low bound; ±Infinity saturate to the
  // bounds naturally through Math.min/max (e.g. Infinity scale → hi, not lo).
  if (Number.isNaN(v)) return lo;
  return Math.min(Math.max(v, lo), hi);
}

/** Normalize degrees to (-180, 180]; a non-finite angle collapses to 0. */
export function normalizeAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return r;
}

/** Printify's default: centred, full width, upright — identical to sending no placement. */
export function defaultPlacement(): Placement {
  return { x: 0.5, y: 0.5, scale: 1, angle: 0 };
}

/**
 * The tool's STARTING placement for a listing with no saved row: centred and upright,
 * but at 90% width rather than filling the whole print area — so the resize/rotate
 * handles (which sit just outside the design's edges) stay inside the print-area box
 * and visible on open, instead of being clipped at the boundary. This is only a
 * suggested starting point the seller adjusts + confirms — distinct from
 * `defaultPlacement()`, which remains the scale-1 "Printify auto-centre" meaning that
 * a listing WITHOUT a saved placement still ships at order time (US-MFTF-17.9).
 */
export const DEFAULT_DESIGN_SCALE = 0.9;
export function initialPlacement(): Placement {
  return { x: 0.5, y: 0.5, scale: DEFAULT_DESIGN_SCALE, angle: 0 };
}

/** Move the design's centre by a normalized delta; the centre stays within [0,1]. */
export function movePlacement(p: Placement, dx: number, dy: number): Placement {
  return { ...p, x: clamp(p.x + dx, 0, 1), y: clamp(p.y + dy, 0, 1) };
}

/** Change scale by a delta, clamped to the provisional [MIN_SCALE, MAX_SCALE] range. */
export function scalePlacement(p: Placement, dScale: number): Placement {
  return { ...p, scale: clamp(p.scale + dScale, MIN_SCALE, MAX_SCALE) };
}

/** Rotate by a delta in degrees, wrapping to (-180, 180]. */
export function rotatePlacement(p: Placement, dAngle: number): Placement {
  return { ...p, angle: normalizeAngle(p.angle + dAngle) };
}

/** Normalize an arbitrary placement into valid ranges (the server-action guard mirror). */
export function clampPlacement(p: Placement): Placement {
  return {
    x: clamp(p.x, 0, 1),
    y: clamp(p.y, 0, 1),
    scale: clamp(p.scale, MIN_SCALE, MAX_SCALE),
    angle: normalizeAngle(p.angle),
  };
}

/** Whether a placement is already valid (finite + within every clamped range). */
export function isValidPlacement(p: Placement): boolean {
  return (
    Number.isFinite(p.x) && p.x >= 0 && p.x <= 1 &&
    Number.isFinite(p.y) && p.y >= 0 && p.y <= 1 &&
    Number.isFinite(p.scale) && p.scale >= MIN_SCALE && p.scale <= MAX_SCALE &&
    Number.isFinite(p.angle) && p.angle >= -180 && p.angle <= 180
  );
}
