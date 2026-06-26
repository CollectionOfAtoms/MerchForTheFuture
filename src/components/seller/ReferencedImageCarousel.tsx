"use client";

import { useState } from "react";
import type { ReferencedCarouselImage } from "@/lib/apparel/referenced";
import { resolveMockupBackground, type MockupBackgrounds } from "@/lib/apparel/mockup-background";

/**
 * Central image carousel for the referenced-listing edit page. Shows uploaded
 * lifestyle photos first, then the per-colour Teemill mockups (ordering owned by
 * `referencedListingCarousel`). Uses plain <img> because Teemill mockups are
 * served from images.podos.io, which is not in the next/image host allowlist.
 */
export default function ReferencedImageCarousel({
  images,
  title,
  backgrounds,
}: {
  images: ReferencedCarouselImage[];
  title: string;
  /** Per-mockup background map (US-MFTF-19.7); composited behind mockups here too. */
  backgrounds?: MockupBackgrounds | null;
}) {
  const [current, setCurrent] = useState(0);
  const bgFor = (img: ReferencedCarouselImage) =>
    img.kind === "mockup" ? resolveMockupBackground(backgrounds, img.label) : undefined;

  if (images.length === 0) {
    return (
      <div className="flex h-72 w-full items-center justify-center rounded-2xl bg-stone-100">
        <span className="text-sm text-stone-400">No images yet</span>
      </div>
    );
  }

  const idx = Math.min(current, images.length - 1);
  const active = images[idx];
  const prev = () => setCurrent((c) => (c - 1 + images.length) % images.length);
  const next = () => setCurrent((c) => (c + 1) % images.length);

  return (
    <div className="space-y-3">
      <div
        // Fixed-size viewer: constant aspect ratio as the seller cycles images;
        // each image is letterboxed with object-contain instead of resizing the box.
        // The letterbox area is transparent; only a mockup's chosen background
        // (US-19.7, applied inline) fills the frame.
        className="relative mx-auto flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl"
        style={bgFor(active) ? { backgroundColor: bgFor(active) } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.url}
          alt={`${title} — ${active.kind === "mockup" ? `${active.label} mockup` : "lifestyle photo"} (${idx + 1} of ${images.length})`}
          className="h-full w-full object-contain"
        />
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
          {active.kind === "mockup" ? `Teemill mockup${active.label ? ` · ${active.label}` : ""}` : "Lifestyle photo"}
        </span>
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white transition-colors"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white transition-colors"
            >
              ›
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              type="button"
              key={img.url}
              onClick={() => setCurrent(i)}
              aria-label={`View image ${i + 1}`}
              className={`shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                i === idx ? "border-stone-900" : "border-transparent hover:border-stone-400"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={`${title} thumbnail ${i + 1}`}
                className="h-14 w-[72px] object-cover"
                style={bgFor(img) ? { backgroundColor: bgFor(img) } : undefined}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
