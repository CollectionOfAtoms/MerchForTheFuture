import type { CartItemKind } from "@/generated/prisma/client";
import type { ShippingQuoteItem } from "@/lib/fulfillment/types";

/** A cart line that passed revalidation, with its authoritative current price. */
export interface KeptItem {
  cartItemId: string;
  kind: CartItemKind;
  /** Resolved fulfillment provider registry key (internal — never shown to buyer). */
  providerKey: string;
  title: string;
  selectionSummary: string;
  /** Current authoritative USD unit price. */
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** What this line contributes to its provider's shipping quote / fulfillment. */
  quoteItem: ShippingQuoteItem;
  /** The line's listing FK (apparel or original), for OrderItem creation in 12.4. */
  apparelListingId: string | null;
  listingId: string | null;
  /** The validated selection payload, for OrderItem creation in 12.4. */
  selection: Record<string, unknown>;
}

export interface RemovedItem {
  title: string;
  reason: string;
}

export interface PriceChange {
  title: string;
  from: number;
  to: number;
}

export interface RevalidationResult {
  kept: KeptItem[];
  removed: RemovedItem[];
  priceChanges: PriceChange[];
}

/** A buyer-facing line within a shipment group (no provider identity). */
export interface SummaryLine {
  title: string;
  selectionSummary: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

/** A buyer-selectable shipping option for a shipment (USD). */
export interface SummaryGroupOption {
  method: string;
  cost: number;
}

/** One shipment group in the checkout summary ("Shipment 1") — no provider name. */
export interface SummaryGroup {
  label: string;
  items: SummaryLine[];
  /** The selected method name (buyer's choice, else cheapest default). */
  shippingMethod: string;
  /** Selected shipping cost in USD (Teemill GBP already converted). */
  shippingCost: number;
  /** All selectable methods for this shipment (USD), cheapest first. */
  options: SummaryGroupOption[];
}

export interface CheckoutSummary {
  /** "ok" → nothing changed, may proceed; "changed" → re-confirm required. */
  status: "ok" | "changed";
  removed: RemovedItem[];
  priceChanges: PriceChange[];
  groups: SummaryGroup[];
  itemsSubtotal: number;
  shippingTotal: number;
  /** Order total before tax (items + shipping). Stripe Tax is added at the session. */
  total: number;
}
