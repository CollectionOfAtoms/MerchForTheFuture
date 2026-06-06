import Link from "next/link";
import Image from "next/image";
import type { ArtworkCard } from "@/lib/artworks/browse";

function formatPrice(card: ArtworkCard): string {
  if (card.price == null) return "";
  const amount = card.price.toLocaleString("en-US", {
    style: "currency",
    currency: card.currency ?? "USD",
    maximumFractionDigits: 0,
  });
  return card.saleType === "AUCTION" ? `Bid from ${amount}` : amount;
}

export default function ListingCard({ card }: { card: ArtworkCard }) {
  const price = formatPrice(card);
  const isSold = card.originalStatus === "SOLD";
  const badge =
    isSold
      ? { label: "Sold", className: "bg-stone-200 text-stone-800" }
      : card.saleType === "AUCTION"
      ? { label: "Auction", className: "bg-amber-200 text-amber-900" }
      : card.saleType === "FIXED_PRICE"
      ? { label: "For sale", className: "bg-emerald-200 text-emerald-900" }
      : null;

  return (
    <Link
      href={`/artwork/${card.id}`}
      className="group relative mb-4 block break-inside-avoid overflow-hidden rounded-2xl bg-stone-100"
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
          <span className="text-sm text-stone-500">No image</span>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-x-0 bottom-0 translate-y-full rounded-b-2xl bg-stone-800/90 p-4 transition-transform duration-300 group-hover:translate-y-0">
        <p className="truncate text-sm font-semibold text-white">{card.title}</p>
        {card.artist && (
          <p className="mt-0.5 truncate text-xs text-stone-300">{card.artist}</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {price && !isSold && <span className="text-sm font-bold text-white">{price}</span>}
          {badge && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
          )}
        </div>
        {(card.hasOriginal && card.hasPrint) && (
          <p className="mt-1 text-[10px] text-stone-400">Original + Prints available</p>
        )}
      </div>
    </Link>
  );
}
