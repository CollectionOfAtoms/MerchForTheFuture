import {
  FulfillmentProvider,
  type FulfillmentOrderParams,
  type FulfillmentOrderResult,
  type FulfillmentStatus,
  type FulfillmentJob,
  type ShippingQuote,
  type ShippingQuoteItem,
  type FulfillmentShippingAddress,
  type FulfillmentStatusQuery,
  type FulfillmentStatusResult,
} from '../types';
import { teemillPost } from '../teemill/client';

/** The shipping method id we select at confirm time. */
// Open Q#7 (docs/teemill-api-notes.md): unverified that a stable "standard" id
// always exists or whether buyer-facing choice is required. Assumed until a live
// proofing order confirms it. // UNVERIFIED
const DEFAULT_SHIPPING_METHOD_ID = 'standard';

interface TeemillOrderResponse {
  id?: string;
  fulfillments?: Array<{
    id?: string;
    availableShippingMethods?: Array<{ id?: string; name?: string; totalPrice?: { amount?: string | number } }>;
  }>;
}

/** Map our normalized address to Teemill's shippingAddress shape. */
function toTeemillAddress(address: FulfillmentShippingAddress) {
  return {
    contactName: address.name,
    company: '',
    addressLine1: address.line1,
    addressLine2: address.line2 ?? '',
    city: address.city,
    postalCode: address.postal,
    country: address.country,
    state: address.state ?? '',
  };
}

export class TeemillFulfillmentProvider extends FulfillmentProvider {
  name = 'teemill';

  async createOrder(_params: FulfillmentOrderParams): Promise<FulfillmentOrderResult> {
    throw new Error('TeemillFulfillmentProvider: not yet implemented');
  }

  async getOrderStatus(_externalOrderId: string): Promise<FulfillmentStatus> {
    throw new Error('TeemillFulfillmentProvider: not yet implemented');
  }

  // ── MFTF-12 (implementations land in 12.3 / 12.5 / 12.6) ──────────────────

  async quoteShipping(
    items: ShippingQuoteItem[],
    address: FulfillmentShippingAddress,
  ): Promise<ShippingQuote> {
    // Step 1 of Teemill's two-step Orders flow: POST /orders returns available
    // shipping methods per fulfillment WITHOUT finalizing the order (confirm is
    // step 2, done at fulfillment time in 12.5). This is the quote.
    // // UNVERIFIED: whether an unconfirmed POST /orders ever expires or bills —
    // needs a live proofing order to confirm (gates 12.3 "Passed").
    const resp = await teemillPost('/orders', {
      contactInformation: { email: '', phone: '' },
      shippingAddress: toTeemillAddress(address),
      items: items.map((i) => ({ variantRef: i.variantRef, quantity: i.quantity })),
    });
    if (!resp.ok) {
      throw new Error(`Teemill quote (POST /orders) failed with status ${resp.status}`);
    }
    const data = (await resp.json()) as TeemillOrderResponse;
    const fulfillment = data.fulfillments?.[0];
    const methods = fulfillment?.availableShippingMethods ?? [];
    const chosen =
      methods.find((m) => m.id === DEFAULT_SHIPPING_METHOD_ID) ?? methods[0];
    const amount = Number(chosen?.totalPrice?.amount ?? 0);
    return {
      // Teemill bills in GBP; the checkout layer converts to USD for the buyer
      // total (the single allowed FX point, for shipping only).
      shippingMethod: chosen?.id ?? DEFAULT_SHIPPING_METHOD_ID,
      shippingCost: Number.isFinite(amount) ? amount : 0,
      currency: 'GBP',
      providerMetadata: { teemillOrderId: data.id, fulfillmentId: fulfillment?.id },
    };
  }

  async checkFulfillmentStatus(_q: FulfillmentStatusQuery): Promise<FulfillmentStatusResult> {
    throw new Error('TeemillFulfillmentProvider.checkFulfillmentStatus: not yet implemented');
  }

  protected async createProviderOrder(_job: FulfillmentJob): Promise<FulfillmentOrderResult> {
    throw new Error('TeemillFulfillmentProvider.createProviderOrder: not yet implemented');
  }
}
