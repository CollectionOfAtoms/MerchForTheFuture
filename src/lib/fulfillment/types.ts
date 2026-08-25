import crypto from "node:crypto";

export type FulfillmentStatus =
  | 'PROCESSING'
  | 'PRINTING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'ERROR';

export const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  'PROCESSING',
  'PRINTING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'ERROR',
];

export interface FulfillmentShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postal: string;
  country: string;
}

/** Legacy single-item create params (MFTF-3). Still used by the print buy-now path. */
export interface FulfillmentOrderParams {
  listingRef: string;
  colorVariantId: string;
  size: string;
  quantity: number;
  buyerName: string;
  sourceImageUrl: string;
  shippingAddress: FulfillmentShippingAddress;
}

export interface FulfillmentOrderResult {
  externalOrderId: string;
  estimatedDispatchDate: string | null;
  providerMetadata: Record<string, unknown>;
}

// ─── MFTF-12 additions ────────────────────────────────────────────────────────

/**
 * One line to be shipped through a provider. Designed apparel / prints carry a
 * `sku` (+ `sourceImageUrl` for prints); referenced apparel carries the cached
 * Teemill `variantRef`. The provider knows which field it needs.
 */
export interface ShippingQuoteItem {
  quantity: number;
  sku?: string;
  variantRef?: string;
  sourceImageUrl?: string;
  /**
   * Provider attributes that identify the variant (Prodigi designed apparel
   * requires size + colour in the provider's raw spelling, e.g. { size: "2xl",
   * color: "white" }). Omitted for prints, whose SKU already encodes the size.
   */
  attributes?: Record<string, string>;
  /**
   * Printify designed apparel (US-MFTF-17.2): a Printify order line is identified by
   * the (blueprint_id, print_provider_id, variant_id) triple — not a single SKU. The
   * design asset travels in `sourceImageUrl`, the print area in `printArea` ("front").
   */
  printifyBlueprintId?: number;
  printifyPrintProviderId?: number;
  printifyVariantId?: number;
  /**
   * Referenced Printify apparel (US-MFTF-17.14): the Printify `product_id` of a product
   * built in our own shop. Present together with `variantRef` (the Printify integer
   * `variant_id`, as a string) for a referenced-Printify line, which orders by
   * { product_id, variant_id } — distinct from the designed `print_areas` branch.
   */
  printifyProductId?: string;
  /** Print area for the design asset (Prodigi apparel = "front"; prints = "default"). */
  printArea?: string;
  /**
   * Printify designed apparel (US-MFTF-17.8/17.9): the seller's saved design placement
   * within the front print area, in Printify's positioned print_areas units (x/y =
   * design centre fraction 0..1, scale = width fraction, angle = degrees). Present only
   * when the listing has a saved placement row; absent → Printify auto-centres (today's
   * simple URL form). A seller-side production detail — never surfaced to buyers.
   */
  placement?: { x: number; y: number; scale: number; angle: number };
  /**
   * True for a print line item whose asset is the seller's exact-aspect framed crop
   * (US-MFTF-PF.5). Framed items send `sizing: "fitPrintArea"` (the crop already
   * matches the SKU face, so no fill-crop is wanted); unframed/apparel items keep the
   * legacy `fillPrintArea`. Canvas wrap travels in `attributes.wrap`.
   */
  framed?: boolean;
}

/** One selectable shipping method for a group (cost in the quote's currency). */
export interface ShippingOption {
  /** Stable, buyer-presentable method name (e.g. "Standard", "Spring USA"). */
  method: string;
  /** Cost in the quote's `currency`. */
  cost: number;
}

/** A shipping quote for one provider group (one shipment). Provider-currency. */
export interface ShippingQuote {
  /** The default (cheapest) method name — back-compat + the pre-selected choice. */
  shippingMethod: string;
  /** Default shipping cost in `currency` (matches `shippingMethod`). */
  shippingCost: number;
  /** ISO 4217 currency the quote is expressed in (e.g. "USD", "GBP"). */
  currency: string;
  /** All buyer-selectable methods (deliverable only). Defaults to the single one. */
  options?: ShippingOption[];
  providerMetadata?: Record<string, unknown>;
}

/** Buyer contact passed to the shipping quote (Teemill requires a valid email). */
export interface QuoteContact {
  email?: string | null;
  phone?: string | null;
}

/** Everything a provider needs to fulfill one shipment (one provider group). */
export interface FulfillmentJob {
  items: ShippingQuoteItem[];
  shippingAddress: FulfillmentShippingAddress;
  /** Buyer contact, where the provider requires it (Teemill). */
  contact?: { email?: string; phone?: string };
  /** Chosen shipping method id, when known from the checkout-time quote. */
  shippingMethod?: string;
  /**
   * Per-order status-callback URL (US-MFTF-14.1). Providers that support per-order
   * webhooks (Prodigi's `callbackUrl`) register this so each shipment's status flows
   * back to a unique, secret-bearing address; the host self-addresses per environment.
   * Providers without webhook support (Teemill) ignore it.
   */
  callbackUrl?: string;
}

/** Identifies a placed fulfillment order for a status check (12.6). */
export interface FulfillmentStatusQuery {
  provider: string;
  providerOrderId: string | null;
}

/** Result of polling/receiving a provider's shipment status (12.6 / 14.2). */
export interface FulfillmentStatusResult {
  /**
   * The provider's raw status mapped to the canonical `FulfillmentStatus` set
   * (US-MFTF-14.2). `null` means the raw status matched no known mapping — a
   * logged parse warning, never a silent transition. The mapping lives inside the
   * provider subclass so provider vocabulary never leaks into shared transition
   * logic. Back-compat: `shipped` remains the boolean projection of `SHIPPED`.
   */
  status?: FulfillmentStatus | null;
  shipped: boolean;
  trackingNumber: string | null;
  carrier: string | null;
  raw?: Record<string, unknown>;
}

/**
 * Abstract base class for every fulfillment provider (MFTF-12.1). All providers —
 * current dropshippers and any future self-fulfillment provider — must implement
 * the full set of abstract methods to compile. Order-processing code calls only
 * the concrete `fulfill()` template method; the polling-vs-webhook divergence and
 * the one-step-vs-two-step order divergence stay inside the subclass.
 */
/** Prefix on the synthetic order id used when order submission is simulated. */
export const SIMULATED_ORDER_PREFIX = "SIMULATED-";

/**
 * Dev safety switch (DROPSHIPPING_SIMULATE_ORDERS): when on, order SUBMISSION to
 * sandbox-less providers (Printify, Teemill — providers with no test environment) is
 * short-circuited. No real external order is created; the shipment is advanced as if
 * the provider confirmed it. Prodigi is unaffected (it has a sandbox). Shipping quotes
 * are NOT simulated — only the order-placement step that would produce/charge.
 */
export function simulateSandboxlessOrders(): boolean {
  const v = (process.env.DROPSHIPPING_SIMULATE_ORDERS ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export abstract class FulfillmentProvider {
  abstract name: string;

  /**
   * True for providers with NO sandbox/test environment (Printify, Teemill), where a
   * real order-submission call creates a real, unbilled-until-produced record on the
   * provider. Gates the DROPSHIPPING_SIMULATE_ORDERS dev switch. Prodigi leaves this
   * false — it has a sandbox (PRODIGI_API_BASE_URL) for safe dev orders.
   */
  protected readonly sandboxless: boolean = false;

  /** Legacy single-item create (MFTF-3); used by the print buy-now path. */
  abstract createOrder(params: FulfillmentOrderParams): Promise<FulfillmentOrderResult>;
  abstract getOrderStatus(externalOrderId: string): Promise<FulfillmentStatus>;

  /** Quote shipping for a group of items to an address (checkout, 12.3). The
   * buyer's contact is passed through because some providers (Teemill) require a
   * valid email even on the quote-step order. */
  abstract quoteShipping(
    items: ShippingQuoteItem[],
    address: FulfillmentShippingAddress,
    contact?: QuoteContact,
  ): Promise<ShippingQuote>;

  /** Detect shipment status (Prodigi webhook / Teemill polling, 12.6). */
  abstract checkFulfillmentStatus(
    fulfillmentOrder: FulfillmentStatusQuery,
  ): Promise<FulfillmentStatusResult>;

  /**
   * Template method: validate → create provider order → confirm. The only entry
   * point order-processing code (the post-payment fan-out, 12.5) calls.
   */
  async fulfill(job: FulfillmentJob): Promise<FulfillmentOrderResult> {
    await this.validateJob(job);
    // Dev safety: simulate submission to sandbox-less providers — advance the order
    // as if confirmed, with no real external order created (DROPSHIPPING_SIMULATE_ORDERS).
    if (this.sandboxless && simulateSandboxlessOrders()) {
      const id = `${SIMULATED_ORDER_PREFIX}${this.name}-${crypto.randomUUID()}`;
      console.warn(`[${this.name}] DROPSHIPPING_SIMULATE_ORDERS on — order NOT submitted; simulated ${id}`);
      return { externalOrderId: id, estimatedDispatchDate: null, providerMetadata: { simulated: true } };
    }
    const created = await this.createProviderOrder(job);
    return this.confirmProviderOrder(job, created);
  }

  /** Shared pre-flight validation. Subclasses may extend via `super.validateJob`. */
  protected async validateJob(job: FulfillmentJob): Promise<void> {
    if (!job.items || job.items.length === 0) {
      throw new Error(`${this.name}: fulfillment job has no items`);
    }
    if (!job.shippingAddress) {
      throw new Error(`${this.name}: fulfillment job missing shipping address`);
    }
  }

  /** Create the provider-side order (Teemill step 1 / Prodigi order create). */
  protected abstract createProviderOrder(job: FulfillmentJob): Promise<FulfillmentOrderResult>;

  /**
   * Confirm the provider order. Default is a single-step no-op (Prodigi). Two-step
   * providers (Teemill: POST /orders/{id}/confirm) override this.
   */
  protected async confirmProviderOrder(
    _job: FulfillmentJob,
    created: FulfillmentOrderResult,
  ): Promise<FulfillmentOrderResult> {
    return created;
  }
}
