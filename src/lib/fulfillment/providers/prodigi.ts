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
  type ShippingOption,
} from '../types';

interface ProdigiOrderResponse {
  outcome?: string;
  order?: {
    id: string;
    status?: { stage?: string };
    shipments?: unknown[];
  };
}

interface ProdigiGetOrderResponse {
  order?: {
    id: string;
    status?: { stage?: string };
    shipments?: unknown[];
  };
}

export class ProdigiFulfillmentProvider extends FulfillmentProvider {
  name = 'prodigi';

  private get base(): string {
    return process.env.PRODIGI_API_BASE_URL ?? 'https://api.prodigi.com/v4.0';
  }

  private get apiKey(): string {
    return process.env.PRODIGI_API_KEY ?? 'test_key';
  }

  async createOrder(params: FulfillmentOrderParams): Promise<FulfillmentOrderResult> {
    const { colorVariantId: sku, quantity, buyerName, sourceImageUrl, shippingAddress } = params;

    const resp = await fetch(`${this.base}/orders`, {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shippingMethod: 'Standard',
        recipient: {
          name: buyerName,
          address: {
            line1: shippingAddress.line1,
            townOrCity: shippingAddress.city,
            stateOrCounty: shippingAddress.state ?? '',
            postalOrZipCode: shippingAddress.postal,
            countryCode: shippingAddress.country,
          },
        },
        items: [
          {
            sku,
            copies: quantity,
            sizing: 'fillPrintArea',
            assets: [{ printArea: 'default', url: sourceImageUrl }],
          },
        ],
      }),
    });

    if (!resp.ok) {
      throw new Error(`Prodigi order creation failed with status ${resp.status}`);
    }

    const data = (await resp.json()) as ProdigiOrderResponse;

    if (!data.order?.id) {
      throw new Error('Prodigi response missing order.id');
    }

    return {
      externalOrderId: data.order.id,
      estimatedDispatchDate: null,
      providerMetadata: data as Record<string, unknown>,
    };
  }

  async getOrderStatus(externalOrderId: string): Promise<FulfillmentStatus> {
    const resp = await fetch(`${this.base}/orders/${externalOrderId}`, {
      headers: { 'X-API-Key': this.apiKey },
    });

    if (!resp.ok) return 'ERROR';

    const data = (await resp.json()) as ProdigiGetOrderResponse;
    const stage = data.order?.status?.stage;
    const hasShipments = (data.order?.shipments?.length ?? 0) > 0;

    switch (stage) {
      case 'InProgress': return 'PROCESSING';
      case 'Complete':   return hasShipments ? 'SHIPPED' : 'DELIVERED';
      case 'Cancelled':  return 'CANCELLED';
      default:           return 'ERROR';
    }
  }

  // ── MFTF-12 (implementations land in 12.3 / 12.5 / 12.6) ──────────────────

  async quoteShipping(
    items: ShippingQuoteItem[],
    address: FulfillmentShippingAddress,
    _contact?: QuoteContact,
  ): Promise<ShippingQuote> {
    // Prodigi quotes return cost in the requested currency, so we ask for USD —
    // no FX needed for the buyer total.
    const resp = await fetch(`${this.base}/quotes`, {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Omit shippingMethod so Prodigi returns a quote for EVERY available
        // service tier (Budget/Standard/Express/Overnight) for buyer selection.
        currencyCode: 'USD',
        destinationCountryCode: address.country,
        // Prodigi prices per variant + print area. Designed apparel must carry
        // size/colour attributes and its print area ("front"); prints carry no
        // attributes and use the "default" print area (their SKU encodes the size).
        items: items.map((i) => ({
          sku: i.sku,
          copies: i.quantity,
          attributes: i.attributes ?? {},
          assets: [{ printArea: i.printArea ?? 'default' }],
        })),
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[prodigi] quote (POST /quotes) → ${resp.status}: ${body || '(empty body)'}`);
      let detail = body;
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed?.message) detail = parsed.message;
      } catch {
        /* not JSON */
      }
      throw new Error(`Prodigi quote failed (${resp.status})${detail ? `: ${detail}` : ''}`);
    }
    const data = (await resp.json()) as {
      quotes?: Array<{
        shipmentMethod?: string;
        costSummary?: { shipping?: { amount?: string | number; currency?: string } };
      }>;
    };
    const quotes = data.quotes ?? [];
    // One buyer-selectable option per returned service tier; cheapest first.
    const options: ShippingOption[] = quotes
      .map((q) => ({
        method: q.shipmentMethod ?? 'Standard',
        cost: Number(q.costSummary?.shipping?.amount ?? 0),
      }))
      .filter((o) => Number.isFinite(o.cost))
      .sort((a, b) => a.cost - b.cost);
    const currency = quotes[0]?.costSummary?.shipping?.currency ?? 'USD';
    const cheapest = options[0] ?? { method: 'Standard', cost: 0 };
    return {
      shippingMethod: cheapest.method,
      shippingCost: cheapest.cost,
      currency,
      options,
      providerMetadata: data as Record<string, unknown>,
    };
  }

  async checkFulfillmentStatus(q: FulfillmentStatusQuery): Promise<FulfillmentStatusResult> {
    const none = { shipped: false, trackingNumber: null, carrier: null };
    if (!q.providerOrderId) return none;
    // Prodigi exposes shipment + tracking on the order; this is the same data its
    // webhook carries, so the status contract is identical to the webhook path.
    const resp = await fetch(`${this.base}/orders/${q.providerOrderId}`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!resp.ok) return none;
    const data = (await resp.json()) as {
      order?: {
        status?: { stage?: string };
        shipments?: Array<{ tracking?: { number?: string; carrier?: string } }>;
      };
    };
    const tracking = data.order?.shipments?.[0]?.tracking;
    const stage = data.order?.status?.stage;
    const dispatched = stage === 'Complete' || stage === 'Dispatched' || stage === 'Shipped';
    return {
      shipped: dispatched && !!tracking?.number,
      trackingNumber: tracking?.number ?? null,
      carrier: tracking?.carrier ?? null,
      raw: data as Record<string, unknown>,
    };
  }

  protected async createProviderOrder(job: FulfillmentJob): Promise<FulfillmentOrderResult> {
    const { shippingAddress } = job;
    const resp = await fetch(`${this.base}/orders`, {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shippingMethod: job.shippingMethod ?? 'Standard',
        recipient: {
          name: shippingAddress.name,
          address: {
            line1: shippingAddress.line1,
            townOrCity: shippingAddress.city,
            stateOrCounty: shippingAddress.state ?? '',
            postalOrZipCode: shippingAddress.postal,
            countryCode: shippingAddress.country,
          },
        },
        items: job.items.map((i) => ({
          sku: i.sku,
          copies: i.quantity,
          sizing: 'fillPrintArea',
          // Designed apparel needs size/colour attributes; the design asset goes on
          // the item's print area ("front" for apparel, "default" for prints).
          ...(i.attributes ? { attributes: i.attributes } : {}),
          assets: i.sourceImageUrl ? [{ printArea: i.printArea ?? 'default', url: i.sourceImageUrl }] : [],
        })),
      }),
    });
    if (!resp.ok) {
      throw new Error(`Prodigi order creation failed with status ${resp.status}`);
    }
    const data = (await resp.json()) as ProdigiOrderResponse;
    if (!data.order?.id) {
      throw new Error('Prodigi response missing order.id');
    }
    return {
      externalOrderId: data.order.id,
      estimatedDispatchDate: null,
      providerMetadata: data as Record<string, unknown>,
    };
  }
  // Prodigi is single-step — the base-class no-op confirmProviderOrder applies.
}
