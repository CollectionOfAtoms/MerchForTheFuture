import Link from "next/link";
import type { DiscoverTile } from "@/lib/discover/feed";

/**
 * Bento layout for the Discover homepage. A dense grid with a few larger tiles so
 * the mixed apparel/art feed reads as intentional regardless of (shuffled) order.
 * Span variety is by position, so it stays stable while the content rotates.
 */
function spanClass(i: number): string {
  const m = i % 6;
  if (m === 0) return "sm:col-span-2 sm:row-span-2"; // feature tile
  if (m === 4) return "sm:row-span-2"; // tall
  if (m === 2) return "lg:col-span-2"; // wide (large screens)
  return "";
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
          className={`group relative overflow-hidden rounded-2xl bg-surface ${spanClass(i)}`}
        >
          {t.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.imageUrl}
              alt={t.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted">No image</div>
          )}

          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
            {t.badge}
          </span>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3">
            <p className="truncate text-sm font-medium text-white">{t.title}</p>
            <p className="text-xs text-white/80">{t.priceLabel}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
