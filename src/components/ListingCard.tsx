import Link from "next/link";
import Image from "next/image";
import type { ArtworkCard } from "@/lib/artworks/browse";
import { localizedPrice, type DisplayCurrency } from "@/lib/tax/currency";

export default function ListingCard({ card, display }: { card: ArtworkCard; display?: DisplayCurrency | null }) {
  const localized = card.price == null ? null : localizedPrice(card.price, display);
  const price = localized
    ? card.saleType === "AUCTION"
      ? `Bid from ${localized.primary}`
      : localized.primary
    : "";
  const isSold = card.originalStatus === "SOLD";
  const badge =
    isSold
      ? { label: "Sold", className: "bg-blue-slate/20 text-blue-slate" }
      : card.saleType === "AUCTION"
      ? { label: "Auction", className: "bg-amber-200 text-amber-900" }
      : card.saleType === "FIXED_PRICE"
      ? { label: "For sale", className: "bg-emerald-200 text-emerald-900" }
      : null;

  return (
    <Link
      href={`/artwork/${card.id}`}
      className="group relative mb-4 block break-inside-avoid overflow-hidden rounded-2xl bg-tuscan-sun/10"
    >
      {card.primaryImageUrl ? (
        <Image
          src={card.primaryImageUrl}
          alt={card.title}
          width={600}
          height={400}
          className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
      ) : (
        <div className="flex h-48 w-full items-center justify-center">
          <span className="text-sm text-dark-cyan">No image</span>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-x-0 bottom-0 translate-y-full rounded-b-2xl bg-cerulean/90 p-4 transition-transform duration-300 group-hover:translate-y-0">
        <p className="truncate text-sm font-semibold text-white">{card.title}</p>
        {card.artist && (
          <p className="mt-0.5 truncate text-xs text-tuscan-sun/80">{card.artist}</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {price && !isSold && (
            <span className="text-sm font-bold text-white">
              {price}
              {localized?.secondary && (
                <span className="ml-1 text-xs font-normal text-tuscan-sun/70">({localized.secondary})</span>
              )}
            </span>
          )}
          {badge && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
          )}
        </div>
        {(card.hasOriginal && card.hasPrint) && (
          <p className="mt-1 text-[10px] text-tuscan-sun/60">Original + Prints available</p>
        )}
      </div>
    </Link>
  );
}
