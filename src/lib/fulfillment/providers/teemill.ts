import type {
  FulfillmentProvider,
  FulfillmentOrderParams,
  FulfillmentOrderResult,
  FulfillmentStatus,
} from '../types';

export class TeemillFulfillmentProvider implements FulfillmentProvider {
  name = 'teemill';

  async createOrder(_params: FulfillmentOrderParams): Promise<FulfillmentOrderResult> {
    throw new Error('TeemillFulfillmentProvider: not yet implemented');
  }

  async getOrderStatus(_externalOrderId: string): Promise<FulfillmentStatus> {
    throw new Error('TeemillFulfillmentProvider: not yet implemented');
  }
}
