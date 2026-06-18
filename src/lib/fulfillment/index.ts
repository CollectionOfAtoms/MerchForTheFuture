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

/**
 * Resolve a provider by its registry key (MFTF-12.3). This is the routing used
 * by multi-provider checkout grouping — `ProductType.fulfillmentProvider` for
 * designed apparel, `ApparelListing.providerKey` for referenced apparel, and
 * `"prodigi"` for prints all normalize to one of these keys.
 */
export function getProviderByKey(providerKey: string): FulfillmentProvider {
  switch (providerKey.toLowerCase()) {
    case 'teemill':
      return new TeemillFulfillmentProvider();
    case 'prodigi':
      return new ProdigiFulfillmentProvider();
    default:
      throw new Error(`Unknown fulfillment provider key: ${providerKey}`);
  }
}
