import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export interface BuyerOrderSummary {
  id: string;
  createdAt: Date;
  totalAmount: Prisma.Decimal;
  status: string;
  listingType: string;
  artwork: { title: string; thumbnailUrl: string | null } | null;
}

export interface BuyerOrderDetail {
  id: string;
  createdAt: Date;
  totalAmount: Prisma.Decimal;
  status: string;
  listingType: string;
  shippingName: string | null;
  shippingLine1: string | null;
  shippingLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostal: string | null;
  shippingCountry: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  mockupUrl: string | null;
  artwork: {
    title: string;
    artist: string | null;
    thumbnailUrl: string | null;
    sellerEmail: string;
  } | null;
}

export async function getBuyerOrders(userId: string): Promise<BuyerOrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { buyerId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      originalListing: {
        include: {
          artwork: {
            select: {
              title: true,
              images: { where: { isPrimary: true }, take: 1, select: { thumbnailUrl: true } },
            },
          },
        },
      },
    },
  });

  return orders.map((order) => {
    const artwork = order.originalListing?.artwork ?? null;
    return {
      id: order.id,
      createdAt: order.createdAt,
      totalAmount: order.totalAmount,
      status: order.status,
      listingType: order.listingType,
      artwork: artwork
        ? { title: artwork.title, thumbnailUrl: artwork.images[0]?.thumbnailUrl ?? null }
        : null,
    };
  });
}

export async function getOrderDetail(
  orderId: string,
  buyerId: string
): Promise<BuyerOrderDetail | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: {
      originalListing: {
        select: {
          printProducts: true,
          artwork: {
            select: {
              title: true,
              artist: true,
              images: { where: { isPrimary: true }, take: 1, select: { thumbnailUrl: true } },
              seller: { select: { email: true } },
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  const artwork = order.originalListing?.artwork ?? null;

  let mockupUrl: string | null = null;
  if (order.prodigiSku && order.originalListing?.printProducts) {
    const products = order.originalListing.printProducts as { sku: string; mockupUrl?: string | null }[];
    mockupUrl = products.find((p) => p.sku === order.prodigiSku)?.mockupUrl ?? null;
  }

  return {
    id: order.id,
    createdAt: order.createdAt,
    totalAmount: order.totalAmount,
    status: order.status,
    listingType: order.listingType,
    shippingName: order.shippingName,
    shippingLine1: order.shippingLine1,
    shippingLine2: order.shippingLine2,
    shippingCity: order.shippingCity,
    shippingState: order.shippingState,
    shippingPostal: order.shippingPostal,
    shippingCountry: order.shippingCountry,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    mockupUrl,
    artwork: artwork
      ? {
          title: artwork.title,
          artist: artwork.artist,
          thumbnailUrl: artwork.images[0]?.thumbnailUrl ?? null,
          sellerEmail: artwork.seller.email,
        }
      : null,
  };
}
