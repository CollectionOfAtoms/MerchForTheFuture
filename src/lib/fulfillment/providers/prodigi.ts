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
    _items: ShippingQuoteItem[],
    _address: FulfillmentShippingAddress,
  ): Promise<ShippingQuote> {
    throw new Error('ProdigiFulfillmentProvider.quoteShipping: not yet implemented');
  }

  async checkFulfillmentStatus(_q: FulfillmentStatusQuery): Promise<FulfillmentStatusResult> {
    throw new Error('ProdigiFulfillmentProvider.checkFulfillmentStatus: not yet implemented');
  }

  protected async createProviderOrder(_job: FulfillmentJob): Promise<FulfillmentOrderResult> {
    throw new Error('ProdigiFulfillmentProvider.createProviderOrder: not yet implemented');
  }
}
