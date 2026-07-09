import Link from "next/link";
import type { ApparelCard } from "@/lib/apparel/browse";
import { localizedPrice, type DisplayCurrency } from "@/lib/tax/currency";
import { mockupBackgroundStyle } from "@/lib/apparel/mockup-background";

/**
 * A single apparel tile on the `/shop` browse grid. Renders the normalized
 * card projection — identical for both sourcing modes. Uses a plain `<img>`
 * (not `next/image`) because referenced listings fall back to Teemill mockups
 * served from `images.podos.io`, which is not in the `next/image` host
 * allowlist; lifestyle photos on Vercel Blob render fine through it too.
 */
export default function ApparelListingCard({ card, display }: { card: ApparelCard; display?: DisplayCurrency | null }) {
  const { primary: price, secondary } = localizedPrice(card.retailPrice, display);
  // A non-null primary background means the tile's image is a (transparent) mockup
  // — show it whole on its backdrop (contain) rather than cropping (cover).
  const primaryBg = card.media?.[0]?.backgroundColor ?? null;

  return (
    <Link
      href={`/shop/${card.id}`}
      className="group block overflow-hidden rounded-2xl bg-tuscan-sun/10 transition-shadow hover:shadow-md"
    >
      {/* When the primary image is a mockup (referenced listing with no lifestyle
          photo), composite its seller-chosen background behind it — same as the
          detail page. Lifestyle photos carry no background, so the tile keeps its
          neutral fill. */}
      <div className="aspect-square w-full overflow-hidden bg-stone-100" style={mockupBackgroundStyle(primaryBg)}>
        {card.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.primaryImageUrl}
            alt={card.title}
            className={`h-full w-full ${primaryBg ? "object-contain" : "object-cover"} transition-transform duration-500 group-hover:scale-105`}
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
          <span className="text-sm font-bold text-cerulean">
            {price}
            {secondary && <span className="ml-1 text-xs font-normal text-dark-cyan">({secondary})</span>}
          </span>
          <span className="text-xs text-dark-cyan">
            Available in {card.colorCount} {card.colorCount === 1 ? "color" : "colors"}
          </span>
        </div>
      </div>
    </Link>
  );
}
