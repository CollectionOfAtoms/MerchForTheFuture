"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { DiscoverTile } from "@/lib/discover/feed";
import { mockupBackgroundStyle } from "@/lib/apparel/mockup-background";

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
 * One bento cell: a cropped resting tile, and — on hover — a popout card that
 * "unfolds" from the tile. The card starts as an exact overlay (same size and
 * crop as the tile), grows horizontally to the primary image's full width, then
 * vertically to reveal the whole image and finally the title/price/description —
 * a 750ms timeline driven by the Web Animations API. Mouse-off reverses that
 * timeline from wherever it is (a brief hover folds back from its partial size,
 * an exact mirror), rather than completing or fading. Every tile animates
 * independently, so sweeping the mouse across the grid folds and unfolds
 * several cards at once.
 *
 * Sizing: the image box is derived from the *covered* image (the one the resting
 * tile shows) — fit inside the caps (portrait/square 420×530, landscape 630×420),
 * then scaled up until it fully covers the hovered cell. The box stays fixed while
 * the carousel navigates; other images letterbox into it (object-contain, their own
 * background colour), so the card never resizes or uncovers the tile.
 *
 * Geometry: the card is centred on the cell's centre (translate(-50%,-50%)), so
 * animating width/height grows it symmetrically and the initially-visible crop
 * stays put. The content wrapper's left/top offsets are calc()s of the card's
 * animating size: they keep the image centre-aligned while it is being revealed,
 * then pin it (top: min(0, …)) once the card grows past the image into the
 * details. The card is never repositioned to fit the viewport — it always
 * emanates from the tile, overflowing the screen edge if it must; the user can
 * scroll to see the rest.
 */
function TileCard({ tile, i }: { tile: DiscoverTile; i: number }) {
  const images = tile.images;
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number; startScale: number } | null>(null);
  const [cell, setCell] = useState<{ w: number; h: number } | null>(null);
  const [hover, setHover] = useState(false);
  const [shown, setShown] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const restImgRef = useRef<HTMLImageElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const popImgRef = useRef<HTMLImageElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const animsRef = useRef<Animation[]>([]);

  const safeIdx = images.length > 0 ? Math.min(idx, images.length - 1) : 0;
  const first = images[0] ?? null;
  const current = images[safeIdx] ?? null;
  const hasMany = images.length > 1;

  // Fixed popout image box: fit the covered (first) image inside the caps, then
  // scale up until the box covers the whole cell. Reading natural dimensions off
  // the resting <img> (rather than onLoad) also works for cached images.
  const measure = useCallback(() => {
    const cellEl = cellRef.current;
    const img = restImgRef.current;
    if (!cellEl || !img || !img.naturalWidth || !img.naturalHeight) return;
    const cr = cellEl.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const landscape = img.naturalWidth > img.naturalHeight;
    const maxW = Math.min(landscape ? 630 : 420, vw * 0.9);
    const maxH = landscape ? 420 : 530;
    const fit = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    let w = img.naturalWidth * fit;
    let h = img.naturalHeight * fit;
    const cover = Math.max(1, cr.width / w, cr.height / h);
    w *= cover;
    h *= cover;
    // The image starts at the tile's object-cover scale (so the folded card is a
    // pixel-match of the tile) and scales up to the box during the fold.
    const coverScale = Math.max(cr.width / img.naturalWidth, cr.height / img.naturalHeight);
    const rw = Math.round(w);
    setCell({ w: Math.round(cr.width), h: Math.round(cr.height) });
    // startScale divides by the *rounded* width the image is laid out at, so the
    // scaled image is never a fraction narrower than the card.
    setBox({ w: rw, h: Math.round(h), startScale: (coverScale * img.naturalWidth) / rw });
  }, []);

  // Measure only while hovered (avoids measuring every tile on load).
  useLayoutEffect(() => {
    if (hover) measure();
  }, [hover, measure]);

  // Drive the fold with the Web Animations API: one 750ms timeline — width grows
  // for the first 40%, then height (image reveal flowing into the details). The
  // image's scale-up shares the width phase's offset and easing: that keeps the
  // picture's visible width ≥ the card's width at every instant (their difference
  // is (coverW − cellW)·(1 − p)), so no side bars appear mid-animation. WAAPI
  // lets mouse-off reverse() the timeline from wherever it is, so a short hover
  // folds back from its partial size instead of completing first. This runs
  // before paint, so the card's first frame is the exact tile overlay.
  useLayoutEffect(() => {
    if (!hover || !box) return;
    const card = cardRef.current;
    const img = popImgRef.current;
    const cellEl = cellRef.current;
    if (!card || !img || !cellEl) return;

    const anims = animsRef.current;
    if (anims.length > 0 && anims[0].playState !== "idle") {
      // Re-hover mid-close: fold back open from the current point.
      for (const a of anims) if (a.playbackRate < 0) a.reverse();
      return;
    }

    const dh = detailsRef.current?.offsetHeight ?? 0;
    const cr = cellEl.getBoundingClientRect();
    const ease = "cubic-bezier(0.45, 0, 0.55, 1)";
    const cardAnim = card.animate(
      [
        { width: `${cr.width}px`, height: `${cr.height}px`, easing: ease, offset: 0 },
        { width: `${box.w}px`, height: `${cr.height}px`, easing: ease, offset: 0.4 },
        { width: `${box.w}px`, height: `${box.h + dh}px`, offset: 1 },
      ],
      { duration: 750, fill: "both" }
    );
    const imgAnim = img.animate(
      [
        { transform: `scale(${box.startScale})`, easing: ease, offset: 0 },
        { transform: "scale(1)", offset: 0.4 },
        { transform: "scale(1)", offset: 1 },
      ],
      { duration: 750, fill: "both" }
    );
    cardAnim.addEventListener("finish", () => {
      // Reverse playback finishing = folded back down to tile size: hide the
      // card and reset the carousel to the image the resting tile shows.
      if (cardAnim.playbackRate < 0) {
        for (const a of animsRef.current) a.cancel();
        animsRef.current = [];
        setShown(false);
        setIdx(0);
      }
    });
    animsRef.current = [cardAnim, imgAnim];
  }, [hover, box]);

  useLayoutEffect(() => {
    return () => {
      for (const a of animsRef.current) a.cancel();
    };
  }, []);

  const onEnter = () => {
    setHover(true);
    setShown(true);
  };

  const onLeave = () => {
    setHover(false);
    for (const a of animsRef.current) if (a.playbackRate > 0) a.reverse();
  };

  const nav = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((p) => (p + delta + images.length) % images.length);
  };

  return (
    <div ref={cellRef} className={`relative ${spanClass(i)}`} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {/* Resting tile: cropped cover, with a compact caption. */}
      <Link href={tile.href} className="relative block h-full w-full overflow-hidden rounded-2xl bg-surface shadow-sm">
        {first ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={restImgRef}
            src={first.url}
            alt={tile.title}
            onLoad={() => {
              if (hover) measure();
            }}
            className="h-full w-full object-cover"
            style={mockupBackgroundStyle(first.backgroundColor)}
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

      {first && (
        // Anchor point at the cell centre; the card always emanates from the
        // tile, even if that puts its edges outside the viewport.
        <div className="absolute left-1/2 top-1/2 z-50">
          <div
            ref={cardRef}
            className={`absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-border ${
              hover ? "pointer-events-auto" : "pointer-events-none"
            } ${shown ? "" : "hidden"}`}
            style={{ width: cell?.w, height: cell?.h }}
          >
            <div
              className="absolute"
              style={
                box
                  ? {
                      width: box.w,
                      left: `calc((100% - ${box.w}px) / 2)`,
                      top: `min(0px, calc((100% - ${box.h}px) / 2))`,
                    }
                  : undefined
              }
            >
              {/* Fixed image box (sized in measure); each carousel image letterboxes
                  into it with its own background colour, so the card never resizes. */}
              <div className="relative">
                <Link href={tile.href} className="block">
                  {current && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      ref={popImgRef}
                      src={current.url}
                      alt={tile.title}
                      className="block max-w-none object-contain"
                      style={{
                        width: box?.w,
                        height: box?.h,
                        transform: box ? `scale(${box.startScale})` : undefined,
                        ...mockupBackgroundStyle(current.backgroundColor),
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

              {/* Details beneath the image; revealed by the last stretch of the fold. */}
              <div ref={detailsRef} className="p-3">
                <p className="break-words text-sm font-semibold text-text">{tile.title}</p>
                <p className="text-xs text-muted">{tile.priceLabel}</p>
                {tile.description && <p className="mt-1.5 line-clamp-3 break-words text-xs leading-snug text-muted">{tile.description}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiscoverBento({ tiles }: { tiles: DiscoverTile[] }) {
  if (tiles.length === 0) {
    return <p className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">Nothing to show yet — check back soon.</p>;
  }

  return (
    <div className="grid grid-flow-dense auto-rows-[160px] grid-cols-2 gap-3 sm:auto-rows-[180px] sm:grid-cols-3">
      {tiles.map((t, i) => (
        <TileCard key={`${t.kind}-${t.id}`} tile={t} i={i} />
      ))}
    </div>
  );
}
