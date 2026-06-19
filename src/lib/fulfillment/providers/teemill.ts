import {
  FulfillmentProvider,
  type FulfillmentOrderParams,
  type FulfillmentOrderResult,
  type FulfillmentStatus,
  type FulfillmentJob,
  type ShippingQuote,
  type ShippingOption,
  type ShippingQuoteItem,
  type FulfillmentShippingAddress,
  type FulfillmentStatusQuery,
  type FulfillmentStatusResult,
  type QuoteContact,
} from '../types';
import { teemillPost, teemillGet, teemillError, teemillDefaultContact } from '../teemill/client';

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

// In-store pickup is never an auto-selectable delivery method for a shipped order.
const COLLECT_METHOD_RE = /collect|pick[\s-]?up|in[\s-]?store/i;

/**
 * Choose a shipping method from a fulfillment's options (Open Q#7, resolved live
 * 2026-06-17): method ids are PER-ORDER UUIDs (not a stable "standard"), names are
 * carrier services like "Spring Tracked" / "Store Collect" / "Spring USA", and the
 * price lives in `totalPrice.amount` (GBP). On the wholesale Orders API shipping is
 * bundled into the item cost, so these are typically £0. We never auto-pick an
 * in-store-collect option, then take the cheapest, tie-broken by listed order.
 */
function chooseTeemillShippingMethod(
  methods: TeemillShippingMethod[],
): TeemillShippingMethod | undefined {
  const shippable = methods.filter((m) => !COLLECT_METHOD_RE.test(m.name ?? ''));
  const pool = shippable.length > 0 ? shippable : methods;
  if (pool.length === 0) return undefined;
  return [...pool].sort(
    (a, b) =>
      (extractShippingAmount(a) ?? Number.POSITIVE_INFINITY) -
      (extractShippingAmount(b) ?? Number.POSITIVE_INFINITY),
  )[0];
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

    // Buyer-selectable options: deliverable methods only (never in-store collect),
    // each with its parseable price; cheapest first.
    const options: ShippingOption[] = methods
      .filter((m) => !COLLECT_METHOD_RE.test(m.name ?? ''))
      .map((m) => ({ method: m.name ?? '', cost: extractShippingAmount(m) ?? 0 }))
      .filter((o) => o.method !== '')
      .sort((a, b) => a.cost - b.cost);

    const chosen = chooseTeemillShippingMethod(methods);
    const amount = extractShippingAmount(chosen);

    // Diagnostic: if we couldn't find a price (or DROPSHIPPING_DEBUG is on), dump
    // the raw response so the actual field shape can be confirmed against the live
    // API. NB on the wholesale Orders API shipping is bundled into the item cost,
    // so a genuine 0.00 here is expected (verified live 2026-06-17).
    if (amount === null || process.env.DROPSHIPPING_DEBUG) {
      console.log(
        `[teemill] quote raw response (methods=${methods.length}, parsedAmount=${amount ?? "none"}):\n` +
          JSON.stringify(data, null, 2),
      );
    }

    return {
      // Method ids are per-order UUIDs, so we store the method NAME (stable across
      // orders) and re-resolve it to an id on the fulfillment order at confirm time.
      shippingMethod: chosen?.name ?? '',
      // Teemill bills in GBP; the checkout layer converts to USD. On the Orders API
      // shipping is bundled into the item cost, so this is typically 0.
      shippingCost: amount ?? 0,
      currency: 'GBP',
      options,
      providerMetadata: { teemillOrderId: data.id, fulfillmentId: fulfillment?.id },
    };
  }

  async checkFulfillmentStatus(q: FulfillmentStatusQuery): Promise<FulfillmentStatusResult> {
    const none = { status: null, shipped: false, trackingNumber: null, carrier: null };
    if (!q.providerOrderId) return none;
    // TODO: replace Teemill polling with webhook once payload shape is confirmed live.
    // Teemill webhook support is unconfirmed (Open Q#2) — until then shipment status
    // is detected by polling GET /orders/{orderRef} on a daily reconciliation cron.
    // The mapping below feeds the SAME shared transition seam (src/lib/fulfillment/
    // status.ts) as the Prodigi webhook path, so the status/email contract is identical
    // regardless of detection method (US-MFTF-14.2).
    const resp = await teemillGet(`/orders/${q.providerOrderId}`);
    if (!resp.ok) return none;
    const data = (await resp.json()) as {
      status?: string;
      fulfillments?: Array<{ status?: string; trackingNumber?: string; carrier?: string }>;
    };
    const fulfillment = data.fulfillments?.[0];
    // // UNVERIFIED: the tracking number + carrier field paths and the raw status
    // values are guesses until a live proofing order confirms them.
    const status = mapTeemillStatusToCanonical(fulfillment?.status ?? data.status);
    return {
      status,
      shipped: status === 'SHIPPED',
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
    const fulfillment = data.fulfillments?.[0];
    return {
      externalOrderId: data.id,
      estimatedDispatchDate: null,
      // Carry the fulfillment's own shipping methods so confirm can resolve the
      // per-order method id (ids differ per order; we match the stored name).
      providerMetadata: {
        fulfillmentId: fulfillment?.id,
        availableShippingMethods: fulfillment?.availableShippingMethods ?? [],
      },
    };
  }

  protected async confirmProviderOrder(
    job: FulfillmentJob,
    created: FulfillmentOrderResult,
  ): Promise<FulfillmentOrderResult> {
    const meta = created.providerMetadata as {
      fulfillmentId?: string;
      availableShippingMethods?: TeemillShippingMethod[];
    };
    const methods = meta.availableShippingMethods ?? [];
    // Resolve the per-order method id: match the stored method name on THIS order's
    // options (ids are per-order UUIDs), else fall back to the standard chooser.
    const byName = job.shippingMethod
      ? methods.find((m) => (m.name ?? '') === job.shippingMethod && !COLLECT_METHOD_RE.test(m.name ?? ''))
      : undefined;
    const chosen = byName ?? chooseTeemillShippingMethod(methods);
    const resp = await teemillPost(`/orders/${created.externalOrderId}/confirm`, [
      { fulfillmentId: meta.fulfillmentId, shippingMethodId: chosen?.id },
    ]);
    if (!resp.ok) {
      throw await teemillError(resp, 'order confirm (POST /orders/{id}/confirm)');
    }
    return created;
  }
}

/**
 * Map a Teemill raw fulfillment/order status to the canonical `FulfillmentStatus`
 * (US-MFTF-14.2). // UNVERIFIED — the raw status vocabulary is a guess until a live
 * proofing order confirms it (no Teemill sandbox). An unrecognised value returns
 * `null` (a logged parse warning upstream, never a silent transition).
 */
export function mapTeemillStatusToCanonical(raw: string | undefined): FulfillmentStatus | null {
  switch ((raw ?? '').toLowerCase()) {
    case 'pending':
    case 'processing':
    case 'confirmed':
      return 'PROCESSING';
    case 'printing':
    case 'in_production':
    case 'production':
      return 'PRINTING';
    case 'dispatched':
    case 'shipped':
      return 'SHIPPED';
    case 'delivered':
      return 'DELIVERED';
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED';
    case 'failed':
    case 'error':
      return 'ERROR';
    default:
      if (raw) console.warn(`[teemill] unknown order status "${raw}" — no transition`);
      return null;
  }
}
