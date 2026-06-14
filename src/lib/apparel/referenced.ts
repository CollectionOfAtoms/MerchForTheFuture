// Read-shape helpers for REFERENCED (Teemill) apparel listings.

/**
 * Convert a provider's HTML product description into plain text suitable for
 * pre-filling the (plain-text) description textarea. Block tags and `<br>` become
 * line breaks; remaining tags are stripped; common entities are decoded; runs of
 * whitespace are collapsed and blank lines dropped. The seller can edit or clear
 * the result — this is only a default.
 */
export function teemillDescriptionToText(html: string | null | undefined): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const decoded = withBreaks
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  return decoded
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
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
