import crypto from "node:crypto";
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
} from "../types";
import {
  printifyGet,
  printifyPost,
  printifyError,
  resolvePrintifyShopId,
} from "../printify/client";

// ── Printify response shapes (order/status/webhook // UNVERIFIED — resolved live
//    at US-MFTF-17.3; catalog + shipping calc verified 2026-07-12) ─────────────
interface PrintifyOrderResponse {
  id?: string;
  status?: string;
}
interface PrintifyGetOrderResponse {
  id?: string;
  status?: string;
  shipments?: Array<{ carrier?: string; number?: string }>;
}
/** Printify quotes shipping as { [method]: integerCents } (USD). */
type PrintifyShippingResponse = Record<string, number>;

/**
 * Printify fulfillment provider (US-MFTF-17.2), DESIGNED mode: a design asset is
 * uploaded onto a curated (blueprint, print_provider, variant) — the Prodigi shape,
 * not a Teemill-style referenced product. Orders are TWO-STEP: create, then an
 * explicit `send-to-production` (the safety valve on a Manual/API "disconnected"
 * shop — a created order is not produced until pushed). Shipment status ships on
 * POLLING (checkFulfillmentStatus) per the Teemill precedent until webhooks are
 * live-confirmed (US-MFTF-17.3).
 */
export class PrintifyFulfillmentProvider extends FulfillmentProvider {
  name = "printify";
  // Printify has no sandbox — gate the DROPSHIPPING_SIMULATE_ORDERS dev switch.
  protected readonly sandboxless = true;

  /** Prefix a shop-scoped path with the resolved shop id (env, else fetched once). */
  private async shopPath(sub: string): Promise<string> {
    return `/shops/${await resolvePrintifyShopId()}${sub}`;
  }

  // Printify has no legacy single-item (MFTF-3) path — designed apparel flows
  // exclusively through the cart fulfill() template, like Teemill.
  async createOrder(_params: FulfillmentOrderParams): Promise<FulfillmentOrderResult> {
    throw new Error("PrintifyFulfillmentProvider: legacy createOrder is not supported (cart-only)");
  }
  async getOrderStatus(_externalOrderId: string): Promise<FulfillmentStatus> {
    throw new Error("PrintifyFulfillmentProvider: legacy getOrderStatus is not supported (cart-only)");
  }

  async quoteShipping(
    items: ShippingQuoteItem[],
    address: FulfillmentShippingAddress,
    contact?: QuoteContact,
  ): Promise<ShippingQuote> {
    // POST /shops/{shop}/orders/shipping.json computes shipping WITHOUT creating an
    // order (verified: returns { standard: 1959 } in USD integer cents).
    const resp = await printifyPost(await this.shopPath("/orders/shipping.json"), {
      line_items: items.map((i) => ({
        blueprint_id: i.printifyBlueprintId,
        print_provider_id: i.printifyPrintProviderId,
        variant_id: i.printifyVariantId,
        quantity: i.quantity,
      })),
      address_to: toPrintifyAddress(address, contact),
    });
    if (!resp.ok) {
      throw await printifyError(resp, "shipping quote (POST /orders/shipping.json)");
    }
    const data = (await resp.json()) as PrintifyShippingResponse;
    // Every returned method → a buyer-selectable option (cents → dollars), cheapest first.
    const options: ShippingOption[] = Object.entries(data)
      .filter(([, cents]) => typeof cents === "number" && Number.isFinite(cents))
      .map(([method, cents]) => ({ method, cost: centsToDollars(cents) }))
      .sort((a, b) => a.cost - b.cost);
    const cheapest = options[0] ?? { method: "standard", cost: 0 };
    return {
      shippingMethod: cheapest.method,
      shippingCost: cheapest.cost,
      currency: "USD",
      options,
      providerMetadata: data as Record<string, unknown>,
    };
  }

  async checkFulfillmentStatus(q: FulfillmentStatusQuery): Promise<FulfillmentStatusResult> {
    const none = { status: null, shipped: false, trackingNumber: null, carrier: null };
    if (!q.providerOrderId) return none;
    // Polling backstop: GET the order and map its status. Feeds the SAME shared
    // transition seam as the webhook path (US-MFTF-14.2). // UNVERIFIED status
    // vocabulary + shipment/tracking field paths until US-MFTF-17.3.
    const resp = await printifyGet(await this.shopPath(`/orders/${q.providerOrderId}.json`));
    if (!resp.ok) return none;
    const data = (await resp.json()) as PrintifyGetOrderResponse;
    const shipment = data.shipments?.[0];
    const status = mapPrintifyStatusToCanonical(data.status);
    return {
      status,
      shipped: status === "SHIPPED",
      trackingNumber: shipment?.number ?? null,
      carrier: shipment?.carrier ?? null,
      raw: data as Record<string, unknown>,
    };
  }

  // ── fulfill() steps — two-step: create then send-to-production ──────────────

  protected async createProviderOrder(job: FulfillmentJob): Promise<FulfillmentOrderResult> {
    // Printify's ORDER print_areas is an OBJECT keyed by print position (front/back).
    // Two value shapes, both live-observed as correct-or-wrong on 2026-08-15:
    //   - SIMPLE (auto-centre): { front: "<designURL>" } — Printify fetches + centres.
    //   - POSITIONED: { front: [{ src, x, y, scale, angle }] } — the seller's saved
    //     placement (US-MFTF-17.8), emitted only when `item.placement` is present.
    // (The product-creation shape — {variant_ids, placeholders, images:[{id,…}]} — is
    // WRONG for the order endpoint: it 400s "The src/x/y/scale/angle field is required".)
    // Listings that never used the placement tool keep sending the simple form, exactly
    // as before — zero regression risk. Submitted with no watermark, per the Prodigi/
    // MFTF-5 design-file path. // UNVERIFIED that src=URL is preferred over an uploaded-
    // image id, and that the positioned form reaches production correctly — both confirm
    // only at a live order (US-MFTF-17.3 / the 17.9 live check).
    const lineItems = job.items.map((item) => {
      // REFERENCED (US-MFTF-17.14): a product already built in our Printify shop is
      // ordered by { product_id, variant_id } — the design/placement/mockups live on
      // the product, so no print_areas travel on the order. A referenced item carries
      // the Printify integer variant_id in `variantRef` plus the product_id; a designed
      // item never has `variantRef`, so this fork can't misfire on designed lines.
      if (item.variantRef) {
        if (!item.printifyProductId) {
          throw new Error("Printify referenced order line is missing the product_id");
        }
        return {
          product_id: item.printifyProductId,
          variant_id: Number(item.variantRef),
          quantity: item.quantity,
        };
      }

      // DESIGNED: the design asset travels on the order line's print_areas.
      const position = item.printArea ?? "front";
      let printAreas: Record<string, unknown> | undefined;
      if (item.sourceImageUrl) {
        const p = item.placement;
        printAreas = {
          [position]: p
            ? [{ src: item.sourceImageUrl, x: p.x, y: p.y, scale: p.scale, angle: p.angle }]
            : item.sourceImageUrl,
        };
      }
      return {
        blueprint_id: item.printifyBlueprintId,
        print_provider_id: item.printifyPrintProviderId,
        variant_id: item.printifyVariantId,
        quantity: item.quantity,
        ...(printAreas ? { print_areas: printAreas } : {}),
      };
    });

    const resp = await printifyPost(await this.shopPath("/orders.json"), {
      label: `MFTF ${new Date().toISOString()}`,
      line_items: lineItems,
      address_to: toPrintifyAddress(job.shippingAddress, { email: job.contact?.email }),
      send_shipping_notification: false,
    });
    if (!resp.ok) {
      throw await printifyError(resp, "order create (POST /orders.json)");
    }
    const data = (await resp.json()) as PrintifyOrderResponse;
    if (!data.id) throw new Error("Printify order response missing id");
    return {
      externalOrderId: data.id,
      estimatedDispatchDate: null,
      providerMetadata: data as Record<string, unknown>,
    };
  }

  protected async confirmProviderOrder(
    _job: FulfillmentJob,
    created: FulfillmentOrderResult,
  ): Promise<FulfillmentOrderResult> {
    // The safety valve: a created order is NOT produced on a Manual/API shop until
    // explicitly sent to production. This is the commit step of the two-step flow.
    const resp = await printifyPost(await this.shopPath(`/orders/${created.externalOrderId}/send-to-production.json`),
      {},
    );
    if (!resp.ok) {
      throw await printifyError(resp, "send to production (POST /orders/{id}/send-to-production.json)");
    }
    return created;
  }
}

/** Map our normalized address to Printify's `address_to` shape. */
function toPrintifyAddress(address: FulfillmentShippingAddress, contact?: QuoteContact) {
  const [first, ...rest] = (address.name ?? "").trim().split(/\s+/);
  return {
    first_name: first ?? "",
    last_name: rest.join(" "),
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    country: address.country,
    region: address.state ?? "",
    address1: address.line1,
    address2: address.line2 ?? "",
    city: address.city,
    zip: address.postal,
  };
}

/** Printify bills in USD integer cents; the buyer total is in dollars. */
function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

// ─── Status mapping (US-MFTF-14.2) ────────────────────────────────────────────
// The provider owns its raw→canonical mapping so the vocabulary never leaks into
// the shared transition logic. // UNVERIFIED raw order-status vocabulary until a
// live order (US-MFTF-17.3); an unrecognised value returns null (a logged warning
// upstream, never a silent transition).

export function mapPrintifyStatusToCanonical(raw: string | undefined): FulfillmentStatus | null {
  switch ((raw ?? "").toLowerCase()) {
    case "pending":
    case "on-hold":
    case "payment-not-received":
      return "PROCESSING";
    case "in-production":
    case "sending-to-production":
      return "PRINTING";
    case "fulfilled":
    case "shipped":
    case "has-been-sent":
      return "SHIPPED";
    case "delivered":
      return "DELIVERED";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    case "failed":
    case "error":
      return "ERROR";
    default:
      if (raw) console.warn(`[printify] unknown order status "${raw}" — no transition`);
      return null;
  }
}

/**
 * Printify webhook event topics this platform handles (US-MFTF-17.2). Events outside
 * this set are acknowledged 200 and ignored. // UNVERIFIED payload shapes + whether a
 * distinct production event exists (PRINTING may be inferred from sent-to-production)
 * — confirmed on the first live webhook (US-MFTF-17.3).
 */
export const HANDLED_PRINTIFY_EVENTS = [
  "order:sent-to-production",
  "order:shipment:created",
  "order:shipment:delivered",
] as const;

export interface PrintifyWebhookEvent {
  type?: string;
  resource?: {
    id?: string;
    data?: { shipments?: Array<{ carrier?: string; number?: string }> };
  };
}

export interface ParsedPrintifyCallback {
  providerOrderId: string;
  status: FulfillmentStatus;
  trackingNumber: string | null;
  carrier: string | null;
}

/**
 * Parse a verified Printify webhook event into the provider-agnostic callback shape
 * the shared transition seam consumes. Returns null for any event outside
 * HANDLED_PRINTIFY_EVENTS (caller acks 200 and ignores) or lacking an order id.
 */
export function mapPrintifyEventToStatus(event: PrintifyWebhookEvent): ParsedPrintifyCallback | null {
  const type = event.type ?? "";
  if (!HANDLED_PRINTIFY_EVENTS.includes(type as (typeof HANDLED_PRINTIFY_EVENTS)[number])) return null;

  const providerOrderId = event.resource?.id;
  if (!providerOrderId) return null;

  const shipment = event.resource?.data?.shipments?.[0];
  let status: FulfillmentStatus;
  if (type === "order:shipment:delivered") status = "DELIVERED";
  else if (type === "order:shipment:created") status = "SHIPPED";
  else status = "PRINTING"; // order:sent-to-production

  return {
    providerOrderId,
    status,
    trackingNumber: shipment?.number ?? null,
    carrier: shipment?.carrier ?? null,
  };
}

/**
 * Verify a Printify webhook signature: HMAC-SHA256 (hex) over the RAW request body
 * using PRINTIFY_WEBHOOK_SECRET, compared in constant time. // UNVERIFIED signature
 * header NAME — captured on the first live webhook (US-MFTF-17.3).
 */
export function verifyPrintifySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = signature.trim().replace(/^sha256=/i, "");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
