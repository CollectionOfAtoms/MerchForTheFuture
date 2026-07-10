import designs from "./background-designs.json";

/**
 * A seller-selectable background design for apparel mockups (US-MFTF-19.7 image
 * backgrounds). `thumbUrl` is shown in the picker; `fullUrl` is the value stored
 * and composited behind the mockup. Populated by `scripts/process-backgrounds.ts`
 * from source art in `assets/backgrounds/`.
 */
export interface BackgroundDesign {
  id: string;
  label: string;
  thumbUrl: string;
  fullUrl: string;
}

export const BACKGROUND_DESIGNS: BackgroundDesign[] = designs as BackgroundDesign[];
