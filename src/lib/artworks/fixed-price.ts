import { prisma } from "@/lib/db";

export async function setPrice(listingId: string, price: number, currency: string) {
  if (!listingId) throw new Error("Listing ID is required.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Price must be a positive number.");

  const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error("Listing not found.");
  if (listing.status === "SOLD") throw new Error("Cannot update price on a sold listing.");
  if (listing.saleType === "AUCTION") throw new Error("Cannot set a fixed price on an auction listing.");

  return prisma.originalListing.update({
    where: { id: listingId },
    data: { price, currency },
  });
}

export async function getProductListing(artworkId: string) {
  const listing = await prisma.originalListing.findUnique({
    where: { artworkId },
    include: {
      artwork: {
        include: { seller: { select: { name: true } } },
      },
    },
  });

  if (!listing) return null;

  return {
    id: listing.id,
    saleType: listing.saleType,
    price: listing.price != null ? Number(listing.price) : null,
    currency: listing.currency,
    status: listing.status,
    artwork: {
      id: listing.artwork.id,
      title: listing.artwork.title,
      description: listing.artwork.description,
      medium: listing.artwork.medium,
      dimensions: listing.artwork.dimensions,
      year: listing.artwork.year,
      sellerName: listing.artwork.seller.name,
    },
  };
}

export async function initiateFixedPricePurchase({
  listingId,
  buyerId,
}: {
  listingId: string;
  buyerId: string;
}) {
  if (!buyerId) throw new Error("Buyer ID is required.");

  const listing = await prisma.originalListing.findUnique({
    where: { id: listingId },
    include: { artwork: true },
  });

  if (!listing) throw new Error("Listing not found.");
  if (listing.saleType !== "FIXED_PRICE") throw new Error("This listing is an auction, not a fixed-price listing.");
  if (listing.status !== "ACTIVE") throw new Error("This listing is not available for purchase.");
  if (listing.artwork.sellerId === buyerId) throw new Error("You cannot buy your own listing.");

  const price = Number(listing.price);

  return prisma.order.create({
    data: {
      buyerId,
      listingType: "ORIGINAL",
      originalListingId: listingId,
      subtotal: price,
      taxAmount: 0,
      totalAmount: price,
      currency: listing.currency,
      status: "PENDING",
    },
  });
}

export async function markListingAsSold(listingId: string) {
  const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error("Listing not found.");
  if (listing.status === "SOLD") throw new Error("Listing is already sold.");
  if (listing.status !== "ACTIVE") throw new Error("Only active listings can be marked as sold.");

  return prisma.originalListing.update({
    where: { id: listingId },
    data: { status: "SOLD" },
  });
}
