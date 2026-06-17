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

type Priceish = { amount?: string | number } | string | number | undefined;

interface TeemillShippingMethod {
  id?: string;
  name?: string;
  totalPrice?: Priceish;
  price?: Priceish;
  cost?: Priceish;
  amount?: string | number;
}

interface TeemillOrderResponse {
  id?: string;
  fulfillments?: Array<{
    id?: string;
    availableShippingMethods?: TeemillShippingMethod[];
  }>;
}

/** Coerce a number|numeric-string to a finite number, else null. */
function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Pull the shipping cost out of a Teemill shipping method, tolerant of where the
 * live API actually puts it. Returns null when no numeric price is found (so the
 * caller can tell "field shape is wrong" apart from a genuine 0). // UNVERIFIED
 * field paths until a live proofing order.
 */
function extractShippingAmount(method: TeemillShippingMethod | undefined): number | null {
  if (!method) return null;
  const candidates: unknown[] = [
    (method.totalPrice as { amount?: unknown })?.amount,
    method.totalPrice,
    (method.price as { amount?: unknown })?.amount,
    method.price,
    (method.cost as { amount?: unknown })?.amount,
    method.cost,
    method.amount,
  ];
  for (const c of candidates) {
    const n = coerceNumber(c);
    if (n !== null) return n;
  }
  return null;
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
    const amount = extractShippingAmount(chosen);

    // Diagnostic: if we couldn't find a price (or DROPSHIPPING_DEBUG is on), dump
    // the raw response so the actual field shape can be confirmed against the live
    // API. The shipping-methods shape is // UNVERIFIED until a proofing order.
    if (amount === null || process.env.DROPSHIPPING_DEBUG) {
      console.log(
        `[teemill] quote raw response (methods=${methods.length}, parsedAmount=${amount ?? "none"}):\n` +
          JSON.stringify(data, null, 2),
      );
    }

    return {
      // Teemill bills in GBP; the checkout layer converts to USD for the buyer
      // total (the single allowed FX point, for shipping only).
      shippingMethod: chosen?.id ?? DEFAULT_SHIPPING_METHOD_ID,
      shippingCost: amount ?? 0,
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
