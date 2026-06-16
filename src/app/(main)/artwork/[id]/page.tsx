import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getArtworkDetail } from "@/lib/artworks/detail";
import ImageLightbox from "@/components/ImageLightbox";
import OwnerUnlistedNotice from "@/components/seller/OwnerUnlistedNotice";
import AuctionCountdown from "./AuctionCountdown";
import PlaceBidForm from "@/components/PlaceBidForm";
import PrintOptionsSelector from "@/components/PrintOptionsSelector";
import { auth } from "@/auth";
import { initiateBuyNowAction } from "@/app/actions/checkout";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const artwork = await getArtworkDetail(id);
  if (!artwork) return { title: "Artwork not found" };
  return {
    title: `${artwork.title} — Merch For The Future`,
    description: artwork.description.slice(0, 160),
    openGraph: artwork.images[0]
      ? { images: [{ url: artwork.images[0].url }] }
      : undefined,
  };
}

export default async function ArtworkDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [artwork, session] = await Promise.all([getArtworkDetail(id), auth()]);
  const sessionUser = session?.user as { id?: string; roles?: string[] } | undefined;
  const isLoggedIn = !!sessionUser?.id;

  if (!artwork) notFound();

  const orig = artwork.original;
  const isSold = orig?.status === "SOLD";
  const isAuction = orig?.saleType === "AUCTION";
  const isFixedPrice = orig?.saleType === "FIXED_PRICE";
  const isSeller = !!sessionUser?.id && sessionUser.id === artwork.sellerId;

  return (
    <>
      {orig && (
        <OwnerUnlistedNotice
          sellerId={artwork.sellerId}
          status={orig.status}
          editHref={`/seller/listings/${orig.listingId}/edit`}
        />
      )}
      <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="grid gap-10 lg:grid-cols-2">
        {/* Left: image carousel */}
        <div>
          <ImageLightbox images={artwork.images} title={artwork.title} />
        </div>

        {/* Right: artwork details */}
        <div className="space-y-6">
          <div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-semibold text-stone-900">{artwork.title}</h1>
              {isSeller && orig && (
                <Link
                  href={`/seller/listings/${orig.listingId}/edit`}
                  className="shrink-0 rounded-full border border-stone-200 px-4 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-400 hover:text-stone-900 transition-colors"
                >
                  Edit listing
                </Link>
              )}
            </div>
            {artwork.artist && (
              <p className="mt-1 text-sm text-stone-500">by {artwork.artist}</p>
            )}
          </div>

          {/* Meta */}
          {(artwork.medium || artwork.dimensions || artwork.year) && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {artwork.medium && (
                <>
                  <dt className="text-stone-500">Medium</dt>
                  <dd className="text-stone-900">{artwork.medium}</dd>
                </>
              )}
              {artwork.dimensions && (
                <>
                  <dt className="text-stone-500">Dimensions</dt>
                  <dd className="text-stone-900">{artwork.dimensions}</dd>
                </>
              )}
              {artwork.year && (
                <>
                  <dt className="text-stone-500">Year</dt>
                  <dd className="text-stone-900">{artwork.year}</dd>
                </>
              )}
            </dl>
          )}

          {/* Description */}
          {artwork.description && (
            <p className="text-sm leading-relaxed text-stone-700 whitespace-pre-line">
              {artwork.description}
            </p>
          )}

          {/* ── Original listing section ── */}
          {orig && (
            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-stone-700">Original Artwork</h2>
                {isSold && (
                  <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                    Sold
                  </span>
                )}
              </div>

              {isFixedPrice && (
                <>
                  <p className="text-2xl font-bold text-stone-900">
                    {orig.price != null
                      ? orig.price.toLocaleString("en-US", {
                          style: "currency",
                          currency: orig.currency,
                          maximumFractionDigits: 0,
                        })
                      : "—"}
                  </p>
                  {isSold ? (
                    <button
                      disabled
                      className="w-full rounded-full bg-stone-200 py-2.5 text-sm font-medium text-stone-400 cursor-not-allowed"
                    >
                      Sold
                    </button>
                  ) : (
                    <form action={initiateBuyNowAction.bind(null, orig.listingId) as unknown as (formData: FormData) => void}>
                      <button
                        type="submit"
                        className="w-full rounded-full bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
                      >
                        Buy Now
                      </button>
                    </form>
                  )}
                </>
              )}

              {isAuction && (
                <>
                  <div className="space-y-1">
                    <p className="text-xs text-stone-500">
                      {orig.bidCount === 0 ? "Starting bid" : "Current bid"}
                    </p>
                    <p className="text-2xl font-bold text-stone-900">
                      {(orig.currentBid ?? orig.startBid ?? 0).toLocaleString("en-US", {
                        style: "currency",
                        currency: orig.currency,
                        maximumFractionDigits: 0,
                      })}
                    </p>
                    {orig.bidCount != null && (
                      <p className="text-xs text-stone-500">
                        {orig.bidCount} {orig.bidCount === 1 ? "bid" : "bids"}
                      </p>
                    )}
                  </div>

                  {orig.auctionEndAt && !isSold && (
                    <AuctionCountdown endAt={orig.auctionEndAt} />
                  )}

                  {isSold ? (
                    <button
                      disabled
                      className="w-full rounded-full bg-stone-200 py-2.5 text-sm font-medium text-stone-400 cursor-not-allowed"
                    >
                      Auction Ended
                    </button>
                  ) : isLoggedIn && orig.auctionId ? (
                    <PlaceBidForm
                      auctionId={orig.auctionId}
                      startBid={orig.startBid ?? 0}
                      currentBid={orig.currentBid}
                      currency={orig.currency}
                    />
                  ) : (
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-500">
                      <p className="font-medium text-stone-700">Place a Bid</p>
                      <p className="mt-1 text-xs">Sign in to place a bid on this auction.</p>
                      <a
                        href="/sign-in"
                        className="mt-3 inline-block rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700 transition-colors"
                      >
                        Sign In to Bid
                      </a>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── Print section ── */}
          {orig?.availableForPrint && Array.isArray(orig.printProducts) && (orig.printProducts as { sku: string; size: string; price: number }[]).length > 0 && (
            <section id="prints" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-3 scroll-mt-8">
              <h2 className="text-sm font-semibold text-stone-700">Prints Available</h2>
              <PrintOptionsSelector
                listingId={orig.listingId}
                printProducts={orig.printProducts as { sku: string; size: string; price: number; mockupUrl?: string | null }[]}
                isLoggedIn={isLoggedIn}
              />
            </section>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
