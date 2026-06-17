export type {
  FulfillmentOrderParams,
  FulfillmentOrderResult,
  FulfillmentStatus,
  FulfillmentShippingAddress,
  ShippingQuote,
  ShippingQuoteItem,
  FulfillmentJob,
  FulfillmentStatusQuery,
  FulfillmentStatusResult,
} from './types';
export { FulfillmentProvider, FULFILLMENT_STATUSES } from './types';
export { ProdigiFulfillmentProvider } from './providers/prodigi';
export { TeemillFulfillmentProvider } from './providers/teemill';
export { createFulfillmentOrder } from './createOrder';

import { ProdigiFulfillmentProvider } from './providers/prodigi';
import { TeemillFulfillmentProvider } from './providers/teemill';
import { FulfillmentProvider } from './types';

export function getFulfillmentProvider(listingType: string): FulfillmentProvider {
  switch (listingType) {
    case 'APPAREL':
      return new TeemillFulfillmentProvider();
    default:
      return new ProdigiFulfillmentProvider();
  }
}
