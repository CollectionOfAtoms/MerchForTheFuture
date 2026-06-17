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
  type QuoteContact,
} from '../types';
import { teemillPost, teemillGet, teemillError, teemillDefaultContact } from '../teemill/client';

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
    contact?: QuoteContact,
  ): Promise<ShippingQuote> {
    // Step 1 of Teemill's two-step Orders flow: POST /orders returns available
    // shipping methods per fulfillment WITHOUT finalizing the order (confirm is
    // step 2, done at fulfillment time in 12.5). This is the quote.
    // // UNVERIFIED: whether an unconfirmed POST /orders ever expires or bills —
    // needs a live proofing order to confirm (gates 12.3 "Passed").
    const fallback = teemillDefaultContact();
    const resp = await teemillPost('/orders', {
      // A valid contact is required even for the quote — Teemill 400s on an empty
      // or unroutable email. Use the buyer's real email; fall back only if absent.
      contactInformation: {
        email: contact?.email || fallback.email,
        phone: contact?.phone || fallback.phone,
      },
      shippingAddress: toTeemillAddress(address),
      items: items.map((i) => ({ variantRef: i.variantRef, quantity: i.quantity })),
    });
    if (!resp.ok) {
      throw await teemillError(resp, 'shipping quote (POST /orders)');
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

  async checkFulfillmentStatus(q: FulfillmentStatusQuery): Promise<FulfillmentStatusResult> {
    const none = { shipped: false, trackingNumber: null, carrier: null };
    if (!q.providerOrderId) return none;
    // TODO: replace Teemill polling with webhook once payload shape is confirmed live.
    // Teemill webhook support is unconfirmed (Open Q#2) — until then shipment status
    // is detected by polling GET /orders/{orderRef} on a daily reconciliation cron.
    const resp = await teemillGet(`/orders/${q.providerOrderId}`);
    if (!resp.ok) return none;
    const data = (await resp.json()) as {
      status?: string;
      fulfillments?: Array<{ status?: string; trackingNumber?: string; carrier?: string }>;
    };
    const fulfillment = data.fulfillments?.[0];
    // // UNVERIFIED: the tracking number + carrier field paths and the dispatched
    // status value are guesses until a live proofing order confirms them.
    const dispatched = fulfillment?.status === 'dispatched';
    return {
      shipped: dispatched && !!fulfillment?.trackingNumber,
      trackingNumber: fulfillment?.trackingNumber ?? null,
      carrier: fulfillment?.carrier ?? null,
      raw: data as Record<string, unknown>,
    };
  }

  // ── fulfill() steps (US-MFTF-12.5) — two-step: create then confirm ─────────

  protected async createProviderOrder(job: FulfillmentJob): Promise<FulfillmentOrderResult> {
    const fallback = teemillDefaultContact();
    const resp = await teemillPost('/orders', {
      contactInformation: {
        email: job.contact?.email || fallback.email,
        phone: job.contact?.phone || fallback.phone,
      },
      shippingAddress: toTeemillAddress(job.shippingAddress),
      items: job.items.map((i) => ({ variantRef: i.variantRef, quantity: i.quantity })),
    });
    if (!resp.ok) {
      throw await teemillError(resp, 'order create (POST /orders)');
    }
    const data = (await resp.json()) as TeemillOrderResponse;
    if (!data.id) {
      throw new Error('Teemill order response missing id');
    }
    return {
      externalOrderId: data.id,
      estimatedDispatchDate: null,
      providerMetadata: { fulfillmentId: data.fulfillments?.[0]?.id },
    };
  }

  protected async confirmProviderOrder(
    job: FulfillmentJob,
    created: FulfillmentOrderResult,
  ): Promise<FulfillmentOrderResult> {
    const fulfillmentId = (created.providerMetadata as { fulfillmentId?: string }).fulfillmentId;
    const shippingMethodId = job.shippingMethod ?? DEFAULT_SHIPPING_METHOD_ID;
    const resp = await teemillPost(`/orders/${created.externalOrderId}/confirm`, [
      { fulfillmentId, shippingMethodId },
    ]);
    if (!resp.ok) {
      throw await teemillError(resp, 'order confirm (POST /orders/{id}/confirm)');
    }
    return created;
  }
}
