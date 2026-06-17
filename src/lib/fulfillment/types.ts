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
}

/** A shipping quote for one provider group (one shipment). Provider-currency. */
export interface ShippingQuote {
  /** The chosen shipping method id (e.g. "standard"). */
  shippingMethod: string;
  /** Shipping cost in `currency`. */
  shippingCost: number;
  /** ISO 4217 currency the quote is expressed in (e.g. "USD", "GBP"). */
  currency: string;
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
}

/** Identifies a placed fulfillment order for a status check (12.6). */
export interface FulfillmentStatusQuery {
  provider: string;
  providerOrderId: string | null;
}

/** Result of polling/receiving a provider's shipment status (12.6). */
export interface FulfillmentStatusResult {
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
export abstract class FulfillmentProvider {
  abstract name: string;

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
