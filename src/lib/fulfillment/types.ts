export type FulfillmentStatus =
  | 'PROCESSING'
  | 'PRINTING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'ERROR';

export const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  'PROCESSING',
  'PRINTING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'ERROR',
];

export interface FulfillmentShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postal: string;
  country: string;
}

export interface FulfillmentOrderParams {
  listingRef: string;
  colorVariantId: string;
  size: string;
  quantity: number;
  buyerName: string;
  sourceImageUrl: string;
  shippingAddress: FulfillmentShippingAddress;
}

export interface FulfillmentOrderResult {
  externalOrderId: string;
  estimatedDispatchDate: string | null;
  providerMetadata: Record<string, unknown>;
}

export interface FulfillmentProvider {
  name: string;
  createOrder(params: FulfillmentOrderParams): Promise<FulfillmentOrderResult>;
  getOrderStatus(externalOrderId: string): Promise<FulfillmentStatus>;
}
