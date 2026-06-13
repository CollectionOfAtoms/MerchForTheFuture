// Verified Teemill `/catalog/products` fixture — the live "Powered By Plants"
// test product (see /docs/teemill-api-notes.md, "Live API Verification 2026-06-12").
// Shared by the global MSW handler and the MFTF-13 tests so expected values and
// the stubbed response never drift apart.

export const POWERED_BY_PLANTS_PRODUCT_ID = "mock-product-powered-by-plants";
export const POWERED_BY_PLANTS_PRODUCT_REF =
  "https://api.teemill.com/v1/catalog/products/mock-product-uuid";
export const POWERED_BY_PLANTS_SLUG = "powered-by-plants";

export const TEEMILL_PROJECT_SUB = "merchforthefuture-451391";

export const COLOUR_HEX: Record<string, string> = {
  "Denim Blue": "#3b5b78",
  Brown: "#5a4632",
  Evergreen: "#23312d",
};

interface VariantSpec {
  id: string;
  colour: string;
  size: string;
  stock: number;
}

// 3 colours × varying sizes; one (Denim Blue / M) is out of stock so tests can
// assert `isOrderable` derives from stock level.
const VARIANT_SPECS: VariantSpec[] = [
  { id: "v-denimblue-s", colour: "Denim Blue", size: "S", stock: 10 },
  { id: "v-denimblue-m", colour: "Denim Blue", size: "M", stock: 0 },
  { id: "v-denimblue-l", colour: "Denim Blue", size: "L", stock: 5 },
  { id: "v-brown-s", colour: "Brown", size: "S", stock: 7 },
  { id: "v-brown-m", colour: "Brown", size: "M", stock: 3 },
  { id: "v-evergreen-m", colour: "Evergreen", size: "M", stock: 73 },
  { id: "v-evergreen-l", colour: "Evergreen", size: "L", stock: 12 },
];

function variantRefFor(id: string): string {
  return `https://api.teemill.com/v1/catalog/variants/uuid-${id}`;
}

function mockupFor(colour: string): string {
  return `https://images.podos.io/mock-${colour.toLowerCase().replace(/\s+/g, "")}.jpg`;
}

export const POWERED_BY_PLANTS_VARIANT_IDS = VARIANT_SPECS.map((s) => s.id);

export interface BuildOptions {
  enabled?: boolean;
  /** Override the GBP base price reported on every variant. */
  basePrice?: number;
  /** Per-variant stock overrides keyed by variant id (e.g. drop one to 0). */
  stockOverrides?: Record<string, number>;
  /** Force every variant to this stock level (e.g. 0 = nothing orderable). */
  forceStock?: number;
  /** Variant ids to omit entirely (simulate a variant vanishing from the catalog). */
  omit?: string[];
}

/** Build the `/catalog/products` JSON body for the Powered By Plants product. */
export function buildPoweredByPlantsCatalog(opts: BuildOptions = {}) {
  const { enabled = true, basePrice = 21, stockOverrides = {}, forceStock, omit = [] } = opts;
  const specs = VARIANT_SPECS.filter((s) => !omit.includes(s.id));

  const variants = specs.map((s) => {
    const stock = forceStock ?? stockOverrides[s.id] ?? s.stock;
    return {
      id: s.id,
      ref: variantRefFor(s.id),
      attributes: [
        { name: "Size", value: s.size },
        { name: "Colour", value: s.colour, thumbnail: { type: "color", value: COLOUR_HEX[s.colour] } },
      ],
      retailPrice: { amount: basePrice, currencyCode: "GBP" },
      price: { amount: basePrice, currencyCode: "GBP" },
      stock: { level: stock, locations: [{ country: "GB", level: stock }] },
      applications: [
        { technology: "dtg", placement: "front", src: "https://images.podos.io/design.png", mockup: null },
      ],
      // Per-colour mockups live at product level (linked by variantIds) — variant
      // images intentionally empty so tests exercise the variantIds linkage.
      images: [],
    };
  });

  // One product-level mockup per colour, tagged with that colour's variant ids.
  const colours = [...new Set(specs.map((s) => s.colour))];
  const images = colours.map((colour) => ({
    src: mockupFor(colour),
    variantIds: specs.filter((s) => s.colour === colour).map((s) => s.id),
  }));

  return {
    products: [
      {
        id: POWERED_BY_PLANTS_PRODUCT_ID,
        ref: POWERED_BY_PLANTS_PRODUCT_REF,
        title: "Powered By Plants",
        description: "<p>Organic cotton tee.</p>",
        slug: POWERED_BY_PLANTS_SLUG,
        enabled,
        sku: "DIY-BLANK-9592969",
        attributes: [
          { name: "Colour", values: colours },
          { name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] },
        ],
        images,
        variants,
      },
    ],
  };
}

export const EXPECTED_MOCKUP_FOR = mockupFor;
export const EXPECTED_VARIANT_REF_FOR = variantRefFor;
