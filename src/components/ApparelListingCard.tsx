import Link from "next/link";
import type { ApparelCard } from "@/lib/apparel/browse";

/**
 * A single apparel tile on the `/shop` browse grid. Renders the normalized
 * card projection — identical for both sourcing modes. Uses a plain `<img>`
 * (not `next/image`) because referenced listings fall back to Teemill mockups
 * served from `images.podos.io`, which is not in the `next/image` host
 * allowlist; lifestyle photos on Vercel Blob render fine through it too.
 */
export default function ApparelListingCard({ card }: { card: ApparelCard }) {
  const price = card.retailPrice.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return (
    <Link
      href={`/shop/${card.id}`}
      className="group block overflow-hidden rounded-2xl bg-tuscan-sun/10 transition-shadow hover:shadow-md"
    >
      <div className="aspect-square w-full overflow-hidden bg-stone-100">
        {card.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.primaryImageUrl}
            alt={card.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-sm text-dark-cyan">No image</span>
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="truncate text-sm font-semibold text-blue-slate">{card.title}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-cerulean">{price}</span>
          <span className="text-xs text-dark-cyan">
            Available in {card.colorCount} {card.colorCount === 1 ? "color" : "colors"}
          </span>
        </div>
      </div>
    </Link>
  );
}
