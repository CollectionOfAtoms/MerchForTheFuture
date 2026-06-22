/**
 * Pure crop geometry for the interactive framing tool (US-MFTF-PF.3). Deliberately
 * DOM-free so the aspect-lock, bounds-clamping, and normalized↔pixel conversions are
 * unit-testable; the React component (FramingTool) wires pointer events to these.
 *
 * A `CropRect` is expressed in fractions of the SOURCE image in `[0..1]`. Because a
 * normalized rect's *pixel* aspect depends on the image's own pixel dimensions, every
 * aspect-aware function takes `imgW`/`imgH` (source pixels).
 */

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Smallest allowed crop edge, as a fraction of the image (prevents degenerate crops). */
export const MIN_CROP_FRACTION = 0.05;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Parse "4:5" → the target pixel aspect (width / height), e.g. 0.8. */
export function parseAspect(aspectRatio: string): number {
  const parts = aspectRatio.split(":");
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!a || !b || !Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error(`Invalid aspect ratio: ${aspectRatio}`);
  }
  return a / b;
}

/** Normalized height that locks a given normalized width to the target pixel aspect. */
export function lockHeightToAspect(w: number, aspect: number, imgW: number, imgH: number): number {
  return (w * imgW) / (aspect * imgH);
}

/** Normalized width that locks a given normalized height to the target pixel aspect. */
export function lockWidthToAspect(h: number, aspect: number, imgW: number, imgH: number): number {
  return (h * aspect * imgH) / imgW;
}

/** The largest aspect-locked rect that fits, centered in the image. */
export function defaultCropRect(aspectRatio: string, imgW: number, imgH: number): CropRect {
  const target = parseAspect(aspectRatio);
  const imageRatio = imgW / imgH;
  if (imageRatio >= target) {
    // Image is wider than the target → height-limited (full height).
    const h = 1;
    const w = target / imageRatio;
    return { x: (1 - w) / 2, y: 0, w, h };
  }
  // Image is taller/narrower → width-limited (full width).
  const w = 1;
  const h = imageRatio / target;
  return { x: 0, y: (1 - h) / 2, w, h };
}

/**
 * Normalize an arbitrary rect to a valid one: locked to the target aspect, no larger
 * than the image, no smaller than the minimum, never inverted, and fully inside the
 * image bounds. The width drives; height is derived (and vice-versa if height would
 * overflow).
 */
export function clampRect(rect: CropRect, aspectRatio: string, imgW: number, imgH: number): CropRect {
  const target = parseAspect(aspectRatio);

  let w = clamp(rect.w, MIN_CROP_FRACTION, 1);
  let h = lockHeightToAspect(w, target, imgW, imgH);
  if (h > 1) {
    h = 1;
    w = lockWidthToAspect(h, target, imgW, imgH);
  }

  const x = clamp(rect.x, 0, 1 - w);
  const y = clamp(rect.y, 0, 1 - h);
  return { x, y, w, h };
}

/** Resize a rect to a new normalized width (anchored at its x/y), staying aspect-locked + valid. */
export function withWidth(rect: CropRect, newW: number, aspectRatio: string, imgW: number, imgH: number): CropRect {
  return clampRect({ ...rect, w: newW }, aspectRatio, imgW, imgH);
}

/** Move a rect by a normalized delta, clamped to stay fully inside the image. */
export function moveRect(rect: CropRect, dx: number, dy: number): CropRect {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, 1 - rect.w),
    y: clamp(rect.y + dy, 0, 1 - rect.h),
  };
}

/** Convert a normalized rect to integer source-pixel coordinates (Sharp `extract`). */
export function toPixelRect(rect: CropRect, imgW: number, imgH: number): PixelRect {
  const left = clamp(Math.round(rect.x * imgW), 0, imgW - 1);
  const top = clamp(Math.round(rect.y * imgH), 0, imgH - 1);
  const width = clamp(Math.round(rect.w * imgW), 1, imgW - left);
  const height = clamp(Math.round(rect.h * imgH), 1, imgH - top);
  return { left, top, width, height };
}

/** Convert a pixel rect back to a normalized rect. */
export function toNormalizedRect(px: PixelRect, imgW: number, imgH: number): CropRect {
  return {
    x: px.left / imgW,
    y: px.top / imgH,
    w: px.width / imgW,
    h: px.height / imgH,
  };
}

/** The actual pixel aspect (width/height) of a normalized rect on the image. */
export function cropPixelAspect(rect: CropRect, imgW: number, imgH: number): number {
  return (rect.w * imgW) / (rect.h * imgH);
}
