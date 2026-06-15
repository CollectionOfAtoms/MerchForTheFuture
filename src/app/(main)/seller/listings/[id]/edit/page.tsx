import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import EditListingForm from "./EditListingForm";
import PrintConfigForm from "@/components/PrintConfigForm";
import { getPrintCatalog, parseArtworkDimensions, type CatalogProduct } from "@/lib/print/listing";
import printCostsJson from "@/lib/print/costs.json";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("SELLER")) redirect("/");

  const listing = await prisma.originalListing.findUnique({
    where: { id },
    include: {
      artwork: { include: { images: true } },
      auction: true,
    },
  });

  if (!listing || listing.artwork.sellerId !== user.id) notFound();

  const catalog: CatalogProduct[] = getPrintCatalog();
  const artworkDimensions = parseArtworkDimensions(listing.artwork.dimensions);

  const serialized = {
    ...listing,
    price: listing.price != null ? listing.price.toString() : null,
    auction: listing.auction
      ? {
          ...listing.auction,
          startBid: listing.auction.startBid.toString(),
          reservePrice: listing.auction.reservePrice != null ? listing.auction.reservePrice.toString() : null,
          currentBid: listing.auction.currentBid != null ? listing.auction.currentBid.toString() : null,
        }
      : null,
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-2">
        <a href="/seller/listings" className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
          ← Back to listings
        </a>
      </div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Edit listing</h1>
          <p className="mt-1 text-sm text-stone-500">{listing.artwork.title}</p>
        </div>
        <a
          href={`/artwork/${listing.artwork.id}`}
          className="shrink-0 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
        >
          View listing →
        </a>
      </div>
      <EditListingForm listing={serialized} />
      <div className="mt-6">
        <PrintConfigForm
          listingId={listing.id}
          initialEnabled={listing.availableForPrint}
          initialSourceUrl={listing.printSourceImageUrl}
          primaryArtworkUrl={listing.artwork.images.find((i) => i.isPrimary)?.url ?? listing.artwork.images[0]?.url ?? null}
          initialProducts={listing.printProducts as { sku: string; size: string; price: number; mockupUrl?: string | null }[] | null}
          catalog={catalog}
          artworkDimensions={artworkDimensions}
          printCosts={printCostsJson}
        />
      </div>
    </div>
  );
}
