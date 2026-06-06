import { prisma } from "@/lib/db";
import type { SaleType } from "@/generated/prisma/client";

interface CreateOriginalListingInput {
  artworkId: string;
  saleType: SaleType;
  price?: number;
  currency?: string;
}

export async function createOriginalListing(input: CreateOriginalListingInput) {
  const { artworkId, saleType, price, currency = "USD" } = input;

  if (saleType === "FIXED_PRICE" && (price === undefined || price === null)) {
    throw new Error("A price is required for fixed-price listings.");
  }

  return prisma.originalListing.create({
    data: {
      artworkId,
      saleType,
      price: price !== undefined ? price : null,
      currency,
    },
  });
}

export async function getOriginalListing(artworkId: string) {
  return prisma.originalListing.findUnique({ where: { artworkId } });
}

export async function setSaleType(listingId: string, saleType: SaleType) {
  return prisma.originalListing.update({
    where: { id: listingId },
    data: { saleType, price: saleType === "AUCTION" ? null : undefined },
  });
}
