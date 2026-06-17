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
    _items: ShippingQuoteItem[],
    _address: FulfillmentShippingAddress,
  ): Promise<ShippingQuote> {
    throw new Error('TeemillFulfillmentProvider.quoteShipping: not yet implemented');
  }

  async checkFulfillmentStatus(_q: FulfillmentStatusQuery): Promise<FulfillmentStatusResult> {
    throw new Error('TeemillFulfillmentProvider.checkFulfillmentStatus: not yet implemented');
  }

  protected async createProviderOrder(_job: FulfillmentJob): Promise<FulfillmentOrderResult> {
    throw new Error('TeemillFulfillmentProvider.createProviderOrder: not yet implemented');
  }
}
