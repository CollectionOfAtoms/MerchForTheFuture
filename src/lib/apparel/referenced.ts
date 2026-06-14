// Read-shape helpers for REFERENCED (Teemill) apparel listings.

function fromCodePointSafe(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

/**
 * Convert a provider's HTML product description into plain text suitable for
 * pre-filling the (plain-text) description textarea. The value is only ever used
 * as a React text/`value` (which escapes it) — there is no HTML-injection path —
 * but we still produce clean text: `<script>`/`<style>` contents and comments are
 * dropped, block tags and `<br>` become line breaks, remaining tags are stripped,
 * named + numeric/hex entities are decoded, control characters are removed, and
 * runs of whitespace/blank lines are collapsed. The seller can edit or clear the
 * result — this is only a default.
 */
export function teemillDescriptionToText(html: string | null | undefined): string {
  if (!html) return "";
  const withBreaks = html
    // Drop script/style element contents entirely (never surface them as text).
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    // Drop HTML comments.
    .replace(/<!--[\s\S]*?-->/g, "")
    // Block-level closers and <br> become line breaks.
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol|tr|table|section|article|header|footer)\s*>/gi, "\n")
    // Strip any remaining tags (including malformed/unclosed leftovers).
    .replace(/<[^>]*>/g, "");
  const decoded = withBreaks
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => fromCodePointSafe(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => fromCodePointSafe(parseInt(dec, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    // Remove control characters except tab and newline.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return decoded
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export interface ReferencedImageInput {
  /** Uploaded lifestyle photos (processed display variant if available). */
  lifestyle: { displayUrl: string | null; originalUrl: string }[];
  /** Cached Teemill per-colour mockups. */
  variants: { mockupUrl: string | null; colorName: string }[];
}

/**
 * The image sources a referenced listing should display: uploaded lifestyle
 * photos when present, otherwise the cached Teemill mockups (one distinct image
 * per colour, in variant order). This is the fallback described by US-MFTF-13.3
 * and consumed by the browse/detail read-shape in MFTF-6.
 */
export function referencedListingImages(input: ReferencedImageInput): string[] {
  if (input.lifestyle.length > 0) {
    return input.lifestyle.map((i) => i.displayUrl ?? i.originalUrl);
  }
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const v of input.variants) {
    if (v.mockupUrl && !seen.has(v.mockupUrl)) {
      seen.add(v.mockupUrl);
      urls.push(v.mockupUrl);
    }
  }
  return urls;
}

export interface ReferencedCarouselImage {
  url: string;
  kind: "lifestyle" | "mockup";
  /** Colour name for a mockup; null for lifestyle photos. */
  label: string | null;
}

/**
 * Ordered images for the referenced-listing edit carousel: uploaded lifestyle
 * photos first (processed display variant when available, else the original),
 * then the distinct per-colour Teemill mockups. Duplicate URLs are dropped so a
 * mockup already shown as a lifestyle photo isn't repeated. Lifestyle photos are
 * taken in the order given (the caller sorts by sortOrder).
 */
export function referencedListingCarousel(input: {
  lifestyle: { displayUrl: string | null; originalUrl: string }[];
  variants: { mockupUrl: string | null; colorName: string }[];
}): ReferencedCarouselImage[] {
  const out: ReferencedCarouselImage[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined, kind: "lifestyle" | "mockup", label: string | null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, kind, label });
  };
  for (const img of input.lifestyle) push(img.displayUrl ?? img.originalUrl, "lifestyle", null);
  for (const v of input.variants) push(v.mockupUrl, "mockup", v.colorName);
  return out;
}

export interface ReferencedColorSwatch {
  colorName: string;
  colorHex: string;
}

/**
 * Distinct offered colours (name + hex) from a set of referenced variants, in
 * first-seen order. Powers the colour swatches on the create preview, edit page,
 * and the MFTF-6 product detail page.
 */
export function referencedListingColors(
  variants: { colorName: string; colorHex: string }[],
): ReferencedColorSwatch[] {
  const seen = new Set<string>();
  const colors: ReferencedColorSwatch[] = [];
  for (const v of variants) {
    if (!seen.has(v.colorName)) {
      seen.add(v.colorName);
      colors.push({ colorName: v.colorName, colorHex: v.colorHex });
    }
  }
  return colors;
}

/**
 * Distinct size labels from a set of referenced variants, in first-seen order.
 */
export function referencedListingSizes(variants: { sizeLabel: string }[]): string[] {
  const seen = new Set<string>();
  const sizes: string[] = [];
  for (const v of variants) {
    if (v.sizeLabel && !seen.has(v.sizeLabel)) {
      seen.add(v.sizeLabel);
      sizes.push(v.sizeLabel);
    }
  }
  return sizes;
}
