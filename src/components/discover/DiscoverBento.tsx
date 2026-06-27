"use client";

import Link from "next/link";
import { useState } from "react";
import type { DiscoverTile } from "@/lib/discover/feed";

/**
 * Bento layout for the Discover homepage. A dense grid of squares, portraits, and
 * the occasional 2×2 feature tile — shapes that suit apparel/art imagery. Span
 * variety is by position, so it stays stable while the content rotates.
 */
function spanClass(i: number): string {
  const m = i % 7;
  if (m === 0) return "sm:col-span-2 sm:row-span-2"; // feature (2×2 square)
  if (m === 2 || m === 5) return "row-span-2"; // tall (portrait)
  return ""; // square (1×1)
}

/**
 * Fixed popout-image height per span, chosen to exceed the cell's rendered height
 * (auto-rows are 160–180px; a 2-row span is ~330–370px), so the popped image is
 * always at least as large as it appears in the bento. Height is fixed and width
 * is auto, so the image never distorts.
 */
function imageHeightClass(i: number): string {
  const m = i % 7;
  const isLarge = m === 0 || m === 2 || m === 5; // feature or tall spans
  return isLarge ? "h-[440px]" : "h-[320px]";
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {direction === "left" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}

/**
 * One bento cell: a cropped resting tile, and — on hover — a popout that lifts
 * above the grid. The popout's card hugs the image's width (the image butts
 * against the top, no side bars), with the title + description in the open space
 * beneath. Its image carousel is navigable; mockup images keep their assigned
 * background colour (theme-independent), while the card itself uses the theme
 * surface. The popout fades + scales in and out for a smooth transition.
 */
function TileCard({ tile, i }: { tile: DiscoverTile; i: number }) {
  const images = tile.images;
  const [idx, setIdx] = useState(0);
  const safeIdx = images.length > 0 ? Math.min(idx, images.length - 1) : 0;
  const first = images[0] ?? null;
  const current = images[safeIdx] ?? null;
  const hasMany = images.length > 1;

  const nav = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((p) => (p + delta + images.length) % images.length);
  };

  return (
    <div className={`group relative ${spanClass(i)}`}>
      {/* Resting tile: cropped cover, with a compact caption. */}
      <Link href={tile.href} className="relative block h-full w-full overflow-hidden rounded-2xl bg-surface shadow-sm">
        {first ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={first.url}
            alt={tile.title}
            className="h-full w-full object-cover"
            style={first.backgroundColor ? { backgroundColor: first.backgroundColor } : undefined}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">No image</div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">{tile.badge}</span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2">
          <p className="truncate text-xs font-medium text-white">{tile.title}</p>
          <p className="text-[11px] text-white/80">{tile.priceLabel}</p>
        </div>
      </Link>

      {/* Popout: floats above the grid on hover, card width = image width. */}
      <div className="pointer-events-none absolute left-1/2 top-0 z-50 w-max max-w-[80vw] -translate-x-1/2 scale-95 opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
        <div className="overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-border">
          {/* Image butts against the top of the card; no side bars (card hugs it).
              Mockups keep their assigned background colour regardless of theme. */}
          <div className="relative">
            <Link href={tile.href} className="block">
              {current && (
                // Fixed height (≥ the bento tile), auto width → never smaller than
                // shown, never distorted. The card hugs this width; max-h caps it
                // on short screens.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.url}
                  alt={tile.title}
                  className={`block w-auto max-h-[80vh] ${imageHeightClass(i)}`}
                  style={current.backgroundColor ? { backgroundColor: current.backgroundColor } : undefined}
                />
              )}
            </Link>
            {hasMany && (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={nav(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white transition-colors hover:bg-black/70"
                >
                  <Chevron direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={nav(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white transition-colors hover:bg-black/70"
                >
                  <Chevron direction="right" />
                </button>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
                  {safeIdx + 1} / {images.length}
                </span>
              </>
            )}
          </div>

          {/* Details in the open space beneath the image. `w-0 min-w-full` makes
              this column take the image's width (not contribute its own intrinsic
              width), so a long title/description wraps instead of widening the
              card past the image. */}
          <div className="w-0 min-w-full p-3">
            <p className="break-words text-sm font-semibold text-text">{tile.title}</p>
            <p className="text-xs text-muted">{tile.priceLabel}</p>
            {tile.description && <p className="mt-1.5 line-clamp-3 break-words text-xs leading-snug text-muted">{tile.description}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DiscoverBento({ tiles }: { tiles: DiscoverTile[] }) {
  if (tiles.length === 0) {
    return <p className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">Nothing to show yet — check back soon.</p>;
  }

  return (
    <div className="grid grid-flow-dense auto-rows-[160px] grid-cols-2 gap-3 sm:auto-rows-[180px] sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <TileCard key={`${t.kind}-${t.id}`} tile={t} i={i} />
      ))}
    </div>
  );
}
