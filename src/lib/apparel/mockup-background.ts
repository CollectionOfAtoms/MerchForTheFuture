// Per-mockup background colors for transparent Teemill mockups (US-MFTF-19.7).
// Prisma-free so client components can import it. The stored value is treated as
// an OPAQUE color string by the renderer — there is no enum coupling between the
// picker's swatch set and what renders, so future colors need no code change here.

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
