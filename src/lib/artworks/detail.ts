import { prisma } from "@/lib/db";

export interface ArtworkDetailOriginal {
  listingId: string;
  saleType: "FIXED_PRICE" | "AUCTION";
  status: string;
  price: number | null;
  currency: string;
  availableForPrint: boolean;
  printSourceImageUrl: string | null;
  printProducts: unknown | null;
  // Auction-only (null for FIXED_PRICE)
  auctionId: string | null;
  startBid: number | null;
  currentBid: number | null;
  bidCount: number | null;
  auctionEndAt: Date | null;
  auctionStatus: string | null;
}

export interface ArtworkDetail {
  id: string;
  sellerId: string;
  title: string;
  artist: string | null;
  description: string;
  medium: string | null;
  dimensions: string | null;
  year: number | null;
  images: { url: string; displayUrl: string | null; isPrimary: boolean; order: number }[];
  original: ArtworkDetailOriginal | null;
}

export async function getArtworkDetail(artworkId: string): Promise<ArtworkDetail | null> {
  const artwork = await prisma.artwork.findUnique({
    where: { id: artworkId },
    include: {
      seller: { select: { name: true } },
      images: { select: { url: true, displayUrl: true, isPrimary: true, order: true }, orderBy: { order: "asc" } },
      originalListing: {
        select: {
          id: true,
          saleType: true,
          status: true,
          price: true,
          currency: true,
          availableForPrint: true,
          printSourceImageUrl: true,
          printProducts: true,
          auction: {
            select: {
              id: true,
              startBid: true,
              currentBid: true,
              bidCount: true,
              endAt: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!artwork || artwork.status !== "PUBLISHED") return null;

  const orig = artwork.originalListing;

  return {
    id: artwork.id,
    sellerId: artwork.sellerId,
    title: artwork.title,
    artist: artwork.artist,
    description: artwork.description,
    medium: artwork.medium,
    dimensions: artwork.dimensions,
    year: artwork.year,
    images: artwork.images,
    original: orig
      ? {
          listingId: orig.id,
          saleType: orig.saleType,
          status: orig.status,
          price: orig.price != null ? Number(orig.price) : null,
          currency: orig.currency,
          availableForPrint: orig.availableForPrint,
          printSourceImageUrl: orig.printSourceImageUrl,
          printProducts: orig.printProducts,
          auctionId: orig.auction?.id ?? null,
          startBid: orig.auction ? Number(orig.auction.startBid) : null,
          currentBid: orig.auction?.currentBid != null ? Number(orig.auction.currentBid) : null,
          bidCount: orig.auction?.bidCount ?? null,
          auctionEndAt: orig.auction?.endAt ?? null,
          auctionStatus: orig.auction?.status ?? null,
        }
      : null,
  };
}
