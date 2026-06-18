/**
 * Server-side cart revalidation at checkout creation (US-MFTF-12.3).
 *
 * No holds, no reservations: current price always wins. Each item is re-checked
 * against live data; stale items are removed from the cart with a human-readable
 * reason; print price drift (current seller price vs the add-time snapshot) is
 * reported so the buyer re-confirms. Pure data logic — the server action wraps it
 * for auth + Stripe handoff.
 */
import { prisma } from "@/lib/db";
import { getApparelListingDetail } from "@/lib/apparel/detail";
import { canonicalSizeLabel } from "@/lib/apparel/sizes";
import { ingestTeemillProduct } from "@/lib/fulfillment/teemill/ingest";
import type { KeptItem, RemovedItem, PriceChange, RevalidationResult } from "./types";

const MATERIAL_LABELS: Record<string, string> = { FAP: "Fine Art Paper", CAN: "Stretched Canvas" };

function printSummary(sku: string): string {
  const parts = sku.split("-");
  const material = MATERIAL_LABELS[parts[1]] ?? parts[1] ?? "Print";
  const size = (parts[2] ?? "").replace(/X/i, "x");
  return size ? `${material} · ${size}` : material;
}

interface PrintProduct {
  sku: string;
  size: string;
  price: number;
}

export async function revalidateCheckout(cartId: string): Promise<RevalidationResult> {
  const items = await prisma.cartItem.findMany({
    where: { cartId },
    orderBy: { addedAt: "asc" },
    include: {
      apparelListing: {
        select: {
          id: true,
          title: true,
          status: true,
          retailPrice: true,
          sourcingMode: true,
          providerKey: true,
          providerProductRef: true,
          productType: {
            select: {
              fulfillmentProvider: true,
              providerSkuBase: true,
              sizes: { select: { sizeLabel: true, providerSizeCode: true } },
              colors: { select: { colorName: true, providerColorCode: true } },
            },
          },
          referencedVariants: true,
        },
      },
      originalListing: {
        select: {
          id: true,
          status: true,
          availableForPrint: true,
          printProducts: true,
          printSourceImageUrl: true,
          artwork: { select: { title: true } },
        },
      },
    },
  });

  const kept: KeptItem[] = [];
  const removed: RemovedItem[] = [];
  const priceChanges: PriceChange[] = [];
  const toDelete: string[] = [];

  for (const item of items) {
    if (item.itemKind === "APPAREL") {
      const listing = item.apparelListing;
      const sel = item.selection as { colorId?: string; sizeLabel?: string };
      const title = listing?.title ?? "Apparel item";
      const colorId = sel.colorId ?? "";
      const sizeLabel = sel.sizeLabel ?? "";

      if (!listing || listing.status !== "ACTIVE") {
        removed.push({ title, reason: `${title} is no longer available.` });
        toDelete.push(item.id);
        continue;
      }

      const detail = await getApparelListingDetail(listing.id);
      if (!detail) {
        removed.push({ title, reason: `${title} is no longer available.` });
        toDelete.push(item.id);
        continue;
      }
      if (!detail.colors.some((c) => c.name === colorId)) {
        removed.push({ title, reason: `${title} in ${colorId} is no longer available.` });
        toDelete.push(item.id);
        continue;
      }
      if (!detail.sizes.includes(sizeLabel)) {
        removed.push({ title, reason: `${title} in size ${sizeLabel} is no longer available.` });
        toDelete.push(item.id);
        continue;
      }

      const isReferenced = listing.referencedVariants.length > 0;
      let quoteItem;

      if (isReferenced) {
        const cached = listing.referencedVariants.find(
          (v) => v.colorName === colorId && v.sizeLabel === sizeLabel,
        );
        if (!cached || !cached.isOrderable) {
          removed.push({ title, reason: `${title} in ${colorId} is no longer available.` });
          toDelete.push(item.id);
          continue;
        }

        // Live stock re-read (Teemill GET /catalog/products). Open Q#3 — rate
        // limits unknown; on any failure fall back to the cached snapshot rather
        // than blowing the 10s function budget. // UNVERIFIED
        let liveStock = cached.stockLevel;
        if (listing.providerProductRef) {
          const result = await ingestTeemillProduct(listing.providerProductRef);
          if (result.ok) {
            const live = result.snapshot.variants.find(
              (v) => v.colorName === colorId && v.sizeLabel === sizeLabel,
            );
            liveStock = live ? live.stockLevel : 0;
          }
        }
        if (liveStock <= 0) {
          removed.push({ title, reason: `${title} in ${colorId} is out of stock.` });
          toDelete.push(item.id);
          continue;
        }
        quoteItem = { variantRef: cached.variantRef, quantity: item.quantity };
      } else {
        // Designed apparel → Prodigi. The blank SKU + the buyer's size/colour in
        // Prodigi's RAW spelling (providerSizeCode/providerColorCode) + the design's
        // print area ("front") are all required by Prodigi's quote/order validation.
        const pt = listing.productType;
        const rawColor =
          pt?.colors.find((c) => c.colorName === colorId)?.providerColorCode ?? colorId;
        const rawSize =
          pt?.sizes.find((s) => canonicalSizeLabel(s.sizeLabel) === sizeLabel)?.providerSizeCode ??
          sizeLabel.toLowerCase();
        quoteItem = {
          sku: pt?.providerSkuBase ?? "",
          quantity: item.quantity,
          attributes: { size: rawSize, color: rawColor },
          printArea: "front",
        };
      }

      const providerKey = isReferenced
        ? (listing.providerKey ?? "teemill")
        : (listing.productType?.fulfillmentProvider ?? "PRODIGI").toLowerCase();
      const unitPrice = Number(listing.retailPrice);

      kept.push({
        cartItemId: item.id,
        kind: "APPAREL",
        providerKey,
        title,
        selectionSummary: [colorId, sizeLabel].filter(Boolean).join(" · "),
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
        quoteItem,
        apparelListingId: listing.id,
        listingId: null,
        selection: { colorId, sizeLabel },
      });
      continue;
    }

    // PRINT
    const listing = item.originalListing;
    const sel = item.selection as { prodigiSku?: string; attributes?: Record<string, string>; quotedUnitPrice?: number };
    const title = listing?.artwork?.title ?? "Print";
    const sku = sel.prodigiSku ?? "";

    if (!listing || listing.status !== "ACTIVE" || !listing.availableForPrint) {
      removed.push({ title, reason: `Prints of ${title} are no longer available.` });
      toDelete.push(item.id);
      continue;
    }
    const products = (listing.printProducts as unknown as PrintProduct[]) ?? [];
    const product = products.find((p) => p.sku === sku);
    if (!product) {
      removed.push({ title, reason: `That print option for ${title} is no longer available.` });
      toDelete.push(item.id);
      continue;
    }

    // Buyer pays the seller's current print price (re-read fresh, replacing the
    // add-time snapshot). The authoritative Prodigi quote (item cost + shipping)
    // is re-fetched per shipment group at the shipping stage.
    const unitPrice = product.price;
    const snapshot = typeof sel.quotedUnitPrice === "number" ? sel.quotedUnitPrice : unitPrice;
    if (unitPrice !== snapshot) {
      priceChanges.push({ title, from: snapshot, to: unitPrice });
    }

    kept.push({
      cartItemId: item.id,
      kind: "PRINT",
      providerKey: "prodigi",
      title,
      selectionSummary: printSummary(sku),
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
      quoteItem: { sku, quantity: item.quantity, sourceImageUrl: listing.printSourceImageUrl ?? undefined },
      apparelListingId: null,
      listingId: listing.id,
      selection: { prodigiSku: sku, attributes: sel.attributes ?? {}, quotedUnitPrice: unitPrice },
    });
  }

  if (toDelete.length > 0) {
    await prisma.cartItem.deleteMany({ where: { id: { in: toDelete } } });
  }

  return { kept, removed, priceChanges };
}
