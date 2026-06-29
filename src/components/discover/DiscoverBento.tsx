"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {direction === "left" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}

/**
 * One bento cell: a cropped resting tile, and — on hover — a popout that lifts
 * above the grid. The popout card hugs the image (image butts against the top, no
 * side bars) with the title + description beneath; its image carousel is navigable
 * and mockups keep their assigned background colour (theme-independent) while the
 * card uses the theme surface. The popout fades + scales in/out.
 *
 * Sizing: the whole box is capped at 650px tall. A portrait/square image is capped
 * at 420px wide / 530px tall; a landscape image flips to 630px wide / 420px tall,
 * so short-wide images read well. Orientation comes from the loaded image. The
 * popout is also clamped to stay within the viewport (never off the screen edge).
 */
function TileCard({ tile, i }: { tile: DiscoverTile; i: number }) {
  const images = tile.images;
  const [idx, setIdx] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [hover, setHover] = useState(false);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const popRef = useRef<HTMLDivElement>(null);

  const safeIdx = images.length > 0 ? Math.min(idx, images.length - 1) : 0;
  const first = images[0] ?? null;
  const current = images[safeIdx] ?? null;
  const hasMany = images.length > 1;
  const isLandscape = dims ? dims.w > dims.h : false;

  // Keep the popout fully on screen: shift it horizontally/vertically so it never
  // crosses the viewport edges.
  const clamp = useCallback(() => {
    const el = popRef.current;
    const cell = el?.parentElement;
    if (!el || !cell) return;
    const pad = 8;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const cr = cell.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const centerX = cr.left + cr.width / 2;

    let x = 0;
    const left = centerX - w / 2;
    const right = centerX + w / 2;
    if (left < pad) x = pad - left;
    else if (right > vw - pad) x = vw - pad - right;

    let y = 0;
    const bottom = cr.top + h;
    if (bottom > vh - pad) y = vh - pad - bottom;
    if (cr.top + y < pad) y = pad - cr.top;

    setShift({ x, y });
  }, []);

  // Recompute only while hovered (avoids measuring every tile on load).
  useEffect(() => {
    if (hover) clamp();
  }, [hover, dims, idx, clamp]);

  const nav = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDims(null);
    setIdx((p) => (p + delta + images.length) % images.length);
  };

  return (
    <div
      className={`group relative ${spanClass(i)}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
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

      {/* Popout positioner: centred over the cell, then nudged to stay on screen. */}
      <div
        ref={popRef}
        className="pointer-events-none absolute left-1/2 top-0 z-50 w-max max-w-[90vw] transition-transform duration-200 ease-out group-hover:pointer-events-auto"
        style={{ transform: `translate(calc(-50% + ${shift.x}px), ${shift.y}px)` }}
      >
        <div className="scale-95 opacity-0 transition-all duration-300 ease-out group-hover:scale-100 group-hover:opacity-100">
          <div className="max-h-[650px] overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-border">
            {/* Image butts against the top of the card; the card hugs its width.
                Landscape images use 630×420 caps; everything else 420×530. */}
            <div className="relative">
              <Link href={tile.href} className="block">
                {current && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current.url}
                    alt={tile.title}
                    onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                    className="block h-auto w-auto"
                    style={{
                      maxWidth: isLandscape ? "min(630px, 90vw)" : "min(420px, 90vw)",
                      maxHeight: isLandscape ? 420 : 530,
                      backgroundColor: current.backgroundColor ?? undefined,
                    }}
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

            {/* Details beneath the image. `w-0 min-w-full` makes this column take
                the image's width (not contribute its own), so a long title or
                description wraps instead of widening the card past the image. */}
            <div className="w-0 min-w-full p-3">
              <p className="break-words text-sm font-semibold text-text">{tile.title}</p>
              <p className="text-xs text-muted">{tile.priceLabel}</p>
              {tile.description && <p className="mt-1.5 line-clamp-3 break-words text-xs leading-snug text-muted">{tile.description}</p>}
            </div>
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
