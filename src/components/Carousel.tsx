"use client";

import { useEffect, useRef, useState } from "react";

/** A white "<" / ">" chevron with a soft dark drop-shadow so the white stroke
 *  stays visible on any background (light, dark, or busy product imagery). */
function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7))" }}
    >
      {direction === "left" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}

export interface CarouselImage {
  url: string;
  /**
   * Background composited BEHIND the image at render time (e.g. a transparent
   * Teemill mockup's seller-chosen backdrop, US-MFTF-19.7). The stored image is
   * never modified. Omit/null for a transparent letterbox (the page shows through).
   */
  backgroundColor?: string | null;
  /** Optional caption overlaid on the frame (e.g. "Teemill mockup · Stone"). */
  badge?: string | null;
}

/**
 * Shared image carousel for both the buyer product view and the seller edit
 * preview. Presentational and uncontrolled by default; pass `index` +
 * `onIndexChange` to control the active slide externally (the buyer view does
 * this so selecting a colour can jump to that colour's mockup).
 *
 * Behaviour, in one place so the two callers stay consistent:
 * - fixed-size 5:4 frame; each image is letterboxed with object-contain so the
 *   box never resizes to the image's dimensions;
 * - the letterbox area is transparent unless the active image carries a
 *   backgroundColor (US-MFTF-19.7), which fills the frame;
 * - on-screen ‹ › arrows and a thumbnail strip when there is more than one image;
 * - Left/Right arrow keys cycle with wraparound, ignored while typing in a form
 *   field or holding a modifier.
 *
 * Uses plain `<img>` because referenced listings serve Teemill mockups from
 * `images.podos.io`, which is not in the `next/image` allowlist.
 */
export default function Carousel({
  images,
  title,
  index: controlledIndex,
  onIndexChange,
  emptyLabel = "No image",
}: {
  images: CarouselImage[];
  title: string;
  index?: number;
  onIndexChange?: (index: number) => void;
  emptyLabel?: string;
}) {
  const count = images.length;
  const isControlled = controlledIndex != null;
  const [internal, setInternal] = useState(0);
  const raw = isControlled ? (controlledIndex as number) : internal;
  const index = count > 0 ? Math.min(Math.max(raw, 0), count - 1) : 0;

  // A ref keeps the keyboard handler reading the current index without re-binding.
  const indexRef = useRef(index);
  indexRef.current = index;

  function goto(next: number) {
    const wrapped = count > 0 ? ((next % count) + count) % count : 0;
    if (!isControlled) setInternal(wrapped);
    onIndexChange?.(wrapped);
  }
  const step = (delta: number) => goto(indexRef.current + delta);

  useEffect(() => {
    if (count <= 1) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // step/goto read the ref, so the listener only needs (re)binding when the
    // number of images changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const active = count > 0 ? images[index] : null;

  return (
    <div className="space-y-3">
      <div
        // Default frame is 5:4. Combined with object-contain + the transparent
        // letterbox and overflow-hidden rounded corners, this gives the intended
        // behaviour: a 5:4 photo fills the box so its corners are clipped to the
        // rounding (corners revealed), while a square photo is pillarboxed and its
        // rounding sits in the transparent side bars (corners not revealed). A
        // mockup's seller-chosen background still fills the frame (US-MFTF-19.7).
        className="relative mx-auto flex aspect-[5/4] w-full items-center justify-center overflow-hidden rounded-2xl"
        style={active?.backgroundColor ? { backgroundColor: active.backgroundColor } : undefined}
      >
        {active ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.url}
            alt={`${title} (${index + 1} of ${count})`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-sm text-stone-400">{emptyLabel}</span>
        )}

        {active?.badge && (
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
            {active.badge}
          </span>
        )}

        {count > 1 && (
          <>
            {/* Subtle nav: transparent button (keeps a comfortable click target)
                with a white chevron. A soft dark drop-shadow on the white stroke
                keeps it legible on any background, light or dark. */}
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous image"
              className="absolute left-1 top-1/2 -translate-y-1/2 bg-transparent p-3 text-white transition-opacity hover:opacity-80"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next image"
              className="absolute right-1 top-1/2 -translate-y-1/2 bg-transparent p-3 text-white transition-opacity hover:opacity-80"
            >
              <ChevronIcon direction="right" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex flex-wrap justify-center gap-2">
          {images.map((img, i) => (
            <button
              type="button"
              key={`${img.url}-${i}`}
              onClick={() => goto(i)}
              aria-label={`View image ${i + 1}`}
              className={`overflow-hidden rounded-lg border-2 transition-colors ${
                i === index ? "border-stone-900" : "border-transparent hover:border-stone-400"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={`${title} thumbnail ${i + 1}`}
                className="h-16 w-16 object-cover"
                style={img.backgroundColor ? { backgroundColor: img.backgroundColor } : undefined}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
