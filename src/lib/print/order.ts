import { prisma } from "@/lib/db";
import { Order } from "@/generated/prisma/client";
import { ProdigiFulfillmentProvider } from "@/lib/fulfillment/providers/prodigi";

interface ShippingAddress {
  name: string;
  line1: string;
  city: string;
  state: string;
  postal: string;
  country: string;
}

interface CreatePrintOrderInput {
  buyerId: string;
  originalListingId: string;
  sku: string;
  size: string;
  quantity: number;
  shipping?: ShippingAddress;
}

interface PrintProduct {
  sku: string;
  size: string;
  price: number;
}


export async function createPrintOrder(input: CreatePrintOrderInput): Promise<Order> {
  const { buyerId, originalListingId, sku, size, quantity, shipping } = input;

  const listing = await prisma.originalListing.findUnique({
    where: { id: originalListingId },
    include: { artwork: { include: { images: { where: { isPrimary: true }, take: 1 } } } },
  });
  if (!listing) throw new Error("Listing not found.");
  if (!listing.availableForPrint) throw new Error("This listing does not have prints available.");

  const products = listing.printProducts as unknown as PrintProduct[];
  const product = products?.find((p) => p.sku === sku);
  if (!product) throw new Error(`SKU ${sku} is not an available product for this listing.`);

  const subtotal = product.price * quantity;

  let prodigiOrderId: string | null = null;
  if (shipping && listing.printSourceImageUrl) {
    const provider = new ProdigiFulfillmentProvider();
    try {
      const result = await provider.createOrder({
        listingRef: originalListingId,
        colorVariantId: sku,
        size,
        quantity,
        buyerName: shipping.name,
        sourceImageUrl: listing.printSourceImageUrl,
        shippingAddress: shipping,
      });
      prodigiOrderId = result.externalOrderId;
    } catch (err) {
      console.error("[createPrintOrder] Prodigi order creation failed:", err);
    }
  }

  return prisma.order.create({
    data: {
      buyerId,
      listingType: "PRINT",
      originalListingId,
      prodigiSku: sku,
      printSize: size,
      quantity,
      subtotal,
      taxAmount: 0,
      totalAmount: subtotal,
      prodigiOrderId,
      ...(shipping && {
        shippingName: shipping.name,
        shippingLine1: shipping.line1,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingPostal: shipping.postal,
        shippingCountry: shipping.country,
      }),
      status: prodigiOrderId ? "PROCESSING" : "PENDING",
    },
  });
}
