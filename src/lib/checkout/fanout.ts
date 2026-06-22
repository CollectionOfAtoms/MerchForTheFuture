/**
 * Post-payment fulfillment fan-out (US-MFTF-12.5). On PAID, each FulfillmentOrder
 * is dispatched through its provider's fulfill() template method, independently:
 * one shipment failing never blocks the others (FAILED + admin retry), and
 * dispatch is idempotent per FulfillmentOrder (a provider order is never placed
 * twice). Reconciles the legacy print path through the same abstraction.
 */
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getProviderByKey } from "@/lib/fulfillment";
import { canonicalSizeLabel } from "@/lib/apparel/sizes";
import { resolvePrintFanout } from "@/lib/print/framing";
import type { FulfillmentJob, ShippingQuoteItem, FulfillmentShippingAddress } from "@/lib/fulfillment/types";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://merchforthefuture.com";

/** Per-shipment status-callback URL carrying an unguessable token (US-MFTF-14.1). */
function webhookCallbackUrl(provider: string, token: string): string {
  return `${BASE_URL}/api/webhooks/${provider}?token=${token}`;
}

const foInclude = {
  order: {
    select: {
      shippingName: true,
      shippingLine1: true,
      shippingLine2: true,
      shippingCity: true,
      shippingState: true,
      shippingPostal: true,
      shippingCountry: true,
      buyer: { select: { email: true } },
    },
  },
  items: {
    include: {
      apparelListing: {
        select: {
          sourcingMode: true,
          // The clean design file to print onto the blank (designed/Prodigi).
          designImageUrl: true,
          productType: {
            select: {
              providerSkuBase: true,
              sizes: { select: { sizeLabel: true, providerSizeCode: true } },
              colors: { select: { colorName: true, providerColorCode: true } },
            },
          },
          referencedVariants: { select: { variantRef: true, colorName: true, sizeLabel: true } },
        },
      },
      originalListing: { select: { artworkId: true, printSourceImageUrl: true, printProducts: true } },
    },
  },
} as const;

type LoadedFulfillmentOrder = NonNullable<
  Awaited<ReturnType<typeof loadFulfillmentOrder>>
>;

function loadFulfillmentOrder(id: string) {
  return prisma.fulfillmentOrder.findUnique({ where: { id }, include: foInclude });
}

function toAddress(order: LoadedFulfillmentOrder["order"]): FulfillmentShippingAddress {
  return {
    name: order.shippingName ?? "",
    line1: order.shippingLine1 ?? "",
    line2: order.shippingLine2 ?? undefined,
    city: order.shippingCity ?? "",
    state: order.shippingState ?? undefined,
    postal: order.shippingPostal ?? "",
    country: order.shippingCountry ?? "US",
  };
}

async function toQuoteItem(item: LoadedFulfillmentOrder["items"][number]): Promise<ShippingQuoteItem> {
  if (item.itemKind === "APPAREL") {
    const sel = item.selection as { colorId?: string; sizeLabel?: string };
    const listing = item.apparelListing;
    const variant = listing?.referencedVariants.find(
      (v) => v.colorName === sel.colorId && v.sizeLabel === sel.sizeLabel,
    );
    if (variant) {
      // Referenced (Teemill) — order by the cached variantRef.
      return { variantRef: variant.variantRef, quantity: item.quantity };
    }
    // Designed (Prodigi) — blank SKU + size/colour in raw provider spelling + the
    // clean design printed on the "front" area. Without these Prodigi 400s the order.
    const pt = listing?.productType;
    const rawColor = pt?.colors.find((c) => c.colorName === sel.colorId)?.providerColorCode ?? sel.colorId ?? "";
    const rawSize =
      pt?.sizes.find((s) => canonicalSizeLabel(s.sizeLabel) === sel.sizeLabel)?.providerSizeCode ??
      (sel.sizeLabel ?? "").toLowerCase();
    return {
      sku: pt?.providerSkuBase ?? "",
      quantity: item.quantity,
      attributes: { size: rawSize, color: rawColor },
      printArea: "front",
      sourceImageUrl: listing?.designImageUrl ?? undefined,
    };
  }
  // PRINT (Prodigi). Send the seller's framed crop + (canvas) wrap (US-MFTF-PF.5).
  const sel = item.selection as { prodigiSku?: string };
  const sku = sel.prodigiSku ?? "";
  const listing = item.originalListing;
  const products = Array.isArray(listing?.printProducts)
    ? (listing!.printProducts as { sku: string; size?: string }[])
    : [];
  const sizeLabel = products.find((p) => p.sku === sku)?.size;
  const resolved = await resolvePrintFanout({
    artworkId: listing?.artworkId ?? "",
    sku,
    sizeLabel,
    fallbackSourceUrl: listing?.printSourceImageUrl,
  });
  return {
    sku,
    quantity: item.quantity,
    sourceImageUrl: resolved.sourceImageUrl,
    attributes: resolved.attributes,
    framed: resolved.framed,
  };
}

/**
 * Dispatch one FulfillmentOrder through its provider. Idempotent: a no-op once a
 * `providerOrderId` is set. Failure-isolating: any error sets FAILED + notes and
 * does not throw, so siblings proceed.
 */
async function processFulfillmentOrder(fulfillmentOrderId: string): Promise<void> {
  const fo = await loadFulfillmentOrder(fulfillmentOrderId);
  if (!fo) return;
  // Idempotency guard — never place the same provider order twice.
  if (fo.providerOrderId) return;

  // Per-order webhook callback (Prodigi only — Teemill has no webhook). Mint an
  // unguessable token once and persist it; a retry reuses the same one so the
  // callback URL is stable. The token both authenticates and resolves the shipment.
  let callbackUrl: string | undefined;
  if (fo.provider === "prodigi") {
    let token = fo.webhookToken;
    if (!token) {
      token = crypto.randomBytes(24).toString("hex");
      await prisma.fulfillmentOrder.update({ where: { id: fo.id }, data: { webhookToken: token } });
    }
    callbackUrl = webhookCallbackUrl("prodigi", token);
  }

  const job: FulfillmentJob = {
    items: await Promise.all(fo.items.map(toQuoteItem)),
    shippingAddress: toAddress(fo.order),
    contact: { email: fo.order.buyer.email ?? "" },
    shippingMethod: fo.shippingMethod ?? undefined,
    callbackUrl,
  };

  try {
    const provider = getProviderByKey(fo.provider);
    const result = await provider.fulfill(job);
    await prisma.fulfillmentOrder.update({
      where: { id: fo.id },
      data: { status: "CONFIRMED", providerOrderId: result.externalOrderId, notes: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[fanout:${fo.provider}] fulfillment failed for ${fo.id}:`, err);
    await prisma.fulfillmentOrder.update({
      where: { id: fo.id },
      data: { status: "FAILED", notes: message },
    });
  }
}

/** Dispatch every FulfillmentOrder on an order (called from the PAID webhook). */
export async function dispatchOrderFulfillment(orderId: string): Promise<void> {
  const fos = await prisma.fulfillmentOrder.findMany({ where: { orderId }, select: { id: true } });
  for (const fo of fos) {
    await processFulfillmentOrder(fo.id);
  }
}

/** Re-run a single shipment (admin retry of a FAILED FulfillmentOrder). */
export async function retryFulfillmentOrder(fulfillmentOrderId: string): Promise<void> {
  await processFulfillmentOrder(fulfillmentOrderId);
}
