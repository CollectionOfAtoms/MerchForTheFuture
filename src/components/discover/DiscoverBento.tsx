import Link from "next/link";
import type { DiscoverTile } from "@/lib/discover/feed";

/**
 * Bento layout for the Discover homepage. A dense grid of squares, portraits, and
 * the occasional 2×2 feature tile — shapes that suit apparel/art imagery (no flat
 * wide boxes). Span variety is by position, so it stays stable while the content
 * rotates. On hover a tile "pops out": it lifts above the grid (scale + shadow +
 * raised z-index) and switches from a cropped cover to the full piece (contain),
 * with the label overlay fading so the whole image is visible.
 */
function spanClass(i: number): string {
  const m = i % 7;
  if (m === 0) return "sm:col-span-2 sm:row-span-2"; // feature (2×2 square)
  if (m === 2 || m === 5) return "row-span-2"; // tall (portrait)
  return ""; // square (1×1)
}

export default function DiscoverBento({ tiles }: { tiles: DiscoverTile[] }) {
  if (tiles.length === 0) {
    return <p className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">Nothing to show yet — check back soon.</p>;
  }

  return (
    <div className="grid grid-flow-dense auto-rows-[160px] grid-cols-2 gap-3 sm:auto-rows-[180px] sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <Link
          key={`${t.kind}-${t.id}`}
          href={t.href}
          className={`group relative overflow-hidden rounded-2xl bg-surface shadow-sm transition-[transform,box-shadow] duration-300 ease-out hover:z-50 hover:scale-[1.6] hover:bg-neutral-900 hover:shadow-2xl ${spanClass(i)}`}
        >
          {t.imageUrl ? (
            // Resting: cover-crop to the tile shape. Hover: contain + top-aligned so
            // the whole piece butts against the top of the popout (no bar above it),
            // leaving the space beneath for the details. The matte goes dark on hover
            // so there's never a white bar around the image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.imageUrl}
              alt={t.title}
              className="h-full w-full object-cover group-hover:object-contain group-hover:object-top"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted">No image</div>
          )}

          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white transition-opacity duration-200 group-hover:opacity-0">
            {t.badge}
          </span>

          {/* Caption: title + price always; the description excerpt unfurls on
              hover so the popped-out tile reads like a little info card. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-3">
            <p className="truncate text-sm font-medium text-white">{t.title}</p>
            <p className="text-xs text-white/80">{t.priceLabel}</p>
            {t.description && (
              <p className="mt-1 max-h-0 overflow-hidden text-xs leading-snug text-white/75 opacity-0 transition-all duration-300 ease-out group-hover:mt-1.5 group-hover:max-h-24 group-hover:opacity-100">
                <span className="line-clamp-3">{t.description}</span>
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
