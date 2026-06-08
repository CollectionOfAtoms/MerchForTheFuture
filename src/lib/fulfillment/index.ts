export type {
  FulfillmentProvider,
  FulfillmentOrderParams,
  FulfillmentOrderResult,
  FulfillmentStatus,
  FulfillmentShippingAddress,
} from './types';
export { FULFILLMENT_STATUSES } from './types';
export { ProdigiFulfillmentProvider } from './providers/prodigi';
export { TeemillFulfillmentProvider } from './providers/teemill';

import { ProdigiFulfillmentProvider } from './providers/prodigi';
import { TeemillFulfillmentProvider } from './providers/teemill';
import type { FulfillmentProvider } from './types';

export function getFulfillmentProvider(listingType: string): FulfillmentProvider {
  switch (listingType) {
    case 'APPAREL':
      return new TeemillFulfillmentProvider();
    default:
      return new ProdigiFulfillmentProvider();
  }
}
