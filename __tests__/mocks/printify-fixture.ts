// Fixture for a Printify product built in our OWN shop, read back via
// `GET /shops/{shop_id}/products/{id}.json` for the REFERENCED lane (US-MFTF-17.12).
//
// Shape LIVE-VERIFIED 2026-08-25 against a real product in the shop:
//   - `options` is an array of option TYPE definitions: a "color" type and a "size"
//     type, each with `values: [{ id, title, colors?: ["#hex"] }]`.
//   - each `variant.options` is an ARRAY of value ids (order not fixed), resolved
//     against the option-values table to get the colour/size names + hex.
//   - `variant.cost` is our production cost (USD cents); `price` is Printify's retail.
//   - `variant.is_enabled` = the merchant offers this variant; `is_available` = the
//     print provider can currently fulfil it (the orderability signal).
//   - each `images[]` entry carries `src` + `variant_ids` + `is_default` + `position`.

export const PRINTIFY_PRODUCT_ID = "6579fa1c8b3e4a0011ab77cd";

// Option-value ids (colours + sizes), as Printify assigns them.
const HEATHER_GREY = 5001;
const BLACK = 5002;
const SIZE_S = 6001;
const SIZE_M = 6002;

export interface RawPrintifyOptionValue {
  id: number;
  title: string;
  colors?: string[];
}
export interface RawPrintifyOption {
  name: string;
  type: string; // "color" | "size"
  values: RawPrintifyOptionValue[];
}
export interface RawPrintifyProductImage {
  src: string;
  variant_ids: number[];
  position: string;
  is_default: boolean;
}
export interface RawPrintifyProductVariant {
  id: number;
  title: string;
  cost: number; // USD integer cents (our production cost)
  price: number; // USD integer cents (Printify retail)
  options: number[]; // option-value ids (colour + size), order not fixed
  is_enabled: boolean;
  is_available: boolean;
}
export interface RawPrintifyProduct {
  id: string;
  title: string;
  description: string | null;
  visible: boolean;
  options: RawPrintifyOption[];
  images: RawPrintifyProductImage[];
  variants: RawPrintifyProductVariant[];
}

/**
 * Build the "Protect Our Oceans" referenced Printify product. Four enabled variants
 * across two colours (Heather Grey, Black) × two sizes (S, M), each colour with its
 * own generated mockup. `Black / M` is out of stock by default (`is_available: false`)
 * so orderability can be asserted. Options are resolved from the option-values table,
 * and one variant lists its option ids in reverse order to prove resolution is not
 * positional.
 */
export function buildPrintifyReferencedProduct(
  opts: {
    cost?: number; // USD cents per variant (production cost)
    unavailableVariantIds?: number[];
    disabledVariantIds?: number[];
    visible?: boolean;
  } = {},
): RawPrintifyProduct {
  const cost = opts.cost ?? 2200;
  const unavailable = new Set(opts.unavailableVariantIds ?? [17402]);
  const disabled = new Set(opts.disabledVariantIds ?? []);
  const variant = (
    id: number,
    title: string,
    options: number[],
  ): RawPrintifyProductVariant => ({
    id,
    title,
    cost,
    price: 4000,
    options,
    is_enabled: !disabled.has(id),
    is_available: !unavailable.has(id),
  });

  return {
    id: PRINTIFY_PRODUCT_ID,
    title: "Protect Our Oceans",
    description: "<p>Printed on a recycled-material tee.</p>",
    visible: opts.visible ?? true,
    options: [
      {
        name: "Colors",
        type: "color",
        values: [
          { id: HEATHER_GREY, title: "Heather Grey", colors: ["#b8bcc2"] },
          { id: BLACK, title: "Black", colors: ["#111111"] },
        ],
      },
      {
        name: "Sizes",
        type: "size",
        values: [
          { id: SIZE_S, title: "S" },
          { id: SIZE_M, title: "M" },
        ],
      },
    ],
    images: [
      {
        src: "https://images.printify.com/mockup/protect-oceans-heather-grey.png",
        variant_ids: [17391, 17392],
        position: "front",
        is_default: true,
      },
      {
        src: "https://images.printify.com/mockup/protect-oceans-black.png",
        variant_ids: [17401, 17402],
        position: "front",
        is_default: false,
      },
    ],
    variants: [
      variant(17391, "Heather Grey / S", [HEATHER_GREY, SIZE_S]),
      variant(17392, "Heather Grey / M", [SIZE_M, HEATHER_GREY]), // reversed on purpose
      variant(17401, "Black / S", [BLACK, SIZE_S]),
      variant(17402, "Black / M", [BLACK, SIZE_M]),
    ],
  };
}
