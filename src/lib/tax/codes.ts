/**
 * Stripe Tax codes + behavior (US-5.1).
 *
 * Stripe's `automatic_tax` requires a product `tax_code` and a price
 * `tax_behavior` on every line for it to compute tax. Everything we sell —
 * apparel, fine-art prints, and physical originals — is tangible goods, so we
 * use the general tangible-goods code for items and the dedicated shipping code
 * for shipment lines. Prices are entered tax-exclusive (the buyer's tax is added
 * on top at checkout). This module is Prisma-free so it is safe to import from
 * anywhere, including the client bundle. See docs/tax-configuration.md.
 */

/** Stripe tax code: "General - Tangible Goods". */
export const DEFAULT_PRODUCT_TAX_CODE = "txcd_99999999";

/** Stripe tax code: "Shipping". */
export const SHIPPING_TAX_CODE = "txcd_92010001";

/** All store prices are tax-exclusive (tax added on top at checkout). */
export const DEFAULT_TAX_BEHAVIOR = "exclusive" as const;

/** Whether Stripe Tax is enabled for live checkout. Default OFF pre-launch. */
export function isStripeTaxEnabled(): boolean {
  return process.env.STRIPE_TAX_ENABLED === "true";
}
