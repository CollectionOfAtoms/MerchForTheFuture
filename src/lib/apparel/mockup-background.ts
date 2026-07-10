// Per-mockup background for transparent Teemill mockups (US-MFTF-19.7). Prisma-free
// so client components can import it. The stored value is an OPAQUE string the
// renderer composites — a CSS color (hex from the swatches) or an image reference
// (a design URL from the picker). The renderer never assumes which, so new colors
// or designs need no code change here.
import type { CSSProperties } from "react";

/** The map persisted on ApparelListing.mockupBackgrounds: colorName → color. */
export type MockupBackgrounds = Record<string, string>;

/** Default background when a mockup has no stored choice. */
export const DEFAULT_MOCKUP_BACKGROUND = "#ffffff";

/** The five swatches the picker offers (white, black, three greys between). */
export const MOCKUP_BACKGROUND_SWATCHES: { label: string; value: string }[] = [
  { label: "White", value: "#ffffff" },
  { label: "Light grey", value: "#e7e5e4" },
  { label: "Grey", value: "#a8a29e" },
  { label: "Dark grey", value: "#57534e" },
  { label: "Black", value: "#000000" },
];

/**
 * The background color to composite behind a mockup, by mockup identity
 * (colorName). Returns the stored opaque value, or the default when unset/missing.
 */
export function resolveMockupBackground(
  backgrounds: MockupBackgrounds | null | undefined,
  colorName: string | null,
): string {
  if (!backgrounds || !colorName) return DEFAULT_MOCKUP_BACKGROUND;
  return backgrounds[colorName] ?? DEFAULT_MOCKUP_BACKGROUND;
}

/** Whether a stored background value is an image reference (URL / path / data URI)
 *  rather than a CSS colour. */
export function isBackgroundImage(value: string | null | undefined): boolean {
  return !!value && /^(https?:\/\/|\/|data:)/i.test(value.trim());
}

/**
 * The inline style that composites a mockup background behind the (transparent)
 * mockup image: an image reference fills as `cover`, a colour as a solid fill.
 * Empty for no value. Used everywhere the mockup background renders so image and
 * colour backgrounds behave identically.
 */
export function mockupBackgroundStyle(value: string | null | undefined): CSSProperties {
  if (!value) return {};
  if (isBackgroundImage(value)) {
    return {
      backgroundImage: `url("${value}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }
  return { backgroundColor: value };
}
