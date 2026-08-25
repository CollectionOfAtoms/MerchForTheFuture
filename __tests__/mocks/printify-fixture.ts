// Fixture for a Printify product built in our OWN shop, read back via
// `GET /shops/{shop_id}/products/{id}.json` for the REFERENCED lane (US-MFTF-17.12).
//
// The product-read variant shape is // UNVERIFIED against the live API — no product
// exists in the shop yet (docs/printify-api-notes.md, "GET /shops/{id}/products.json
// → 0"). This fixture follows the shape the US-MFTF-17.12 TDD Notes prescribe and the
// catalog-variants fixture already uses: each variant carries `options: {color, size}`
// (names) + a USD-cents `price` + `is_enabled`/`is_available`; each `images[]` entry
// carries `src` + `variant_ids` + `is_default` + `position`, exactly as the product
// `images[]` are documented (src, variant_ids, position, is_default).

export const PRINTIFY_PRODUCT_ID = "6579fa1c8b3e4a0011ab77cd";

export interface RawPrintifyProductImage {
  src: string;
  variant_ids: number[];
  position: string;
  is_default: boolean;
}
export interface RawPrintifyProductVariant {
  id: number;
  title: string;
  price: number; // USD integer cents
  options: { color: string; size: string };
  is_enabled: boolean;
  is_available: boolean;
}
export interface RawPrintifyProduct {
  id: string;
  title: string;
  description: string | null;
  visible: boolean;
  images: RawPrintifyProductImage[];
  variants: RawPrintifyProductVariant[];
}

/**
 * Build the "Protect Our Oceans" referenced Printify product. Four orderable
 * variants across two colours (Heather Grey, Black) × two sizes (S, M), each colour
 * with its own generated mockup. `Black / M` is out of stock by default
 * (`is_available: false`) so orderability can be asserted.
 */
export function buildPrintifyReferencedProduct(
  opts: {
    price?: number; // USD cents per variant
    unavailableVariantIds?: number[];
    visible?: boolean;
  } = {},
): RawPrintifyProduct {
  const price = opts.price ?? 2200;
  const unavailable = new Set(opts.unavailableVariantIds ?? [17402]);
  const variant = (
    id: number,
    color: string,
    size: string,
  ): RawPrintifyProductVariant => ({
    id,
    title: `${color} / ${size}`,
    price,
    options: { color, size },
    is_enabled: true,
    is_available: !unavailable.has(id),
  });

  return {
    id: PRINTIFY_PRODUCT_ID,
    title: "Protect Our Oceans",
    description: "<p>Printed on a recycled-material tee.</p>",
    visible: opts.visible ?? true,
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
      variant(17391, "Heather Grey", "S"),
      variant(17392, "Heather Grey", "M"),
      variant(17401, "Black", "S"),
      variant(17402, "Black", "M"),
    ],
  };
}
