"use client";

import { useState } from "react";
import Image from "next/image";

interface CarouselImage {
  url: string;
  displayUrl?: string | null;
  isPrimary: boolean;
  order: number;
}

export default function ImageCarousel({ images, title }: { images: CarouselImage[]; title: string }) {
  const sorted = [...images].sort((a, b) => a.order - b.order);
  const primaryIdx = sorted.findIndex((img) => img.isPrimary);
  const [current, setCurrent] = useState(primaryIdx >= 0 ? primaryIdx : 0);

  if (sorted.length === 0) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded-2xl bg-stone-100">
        <span className="text-sm text-stone-400">No image</span>
      </div>
    );
  }

  const prev = () => setCurrent((c) => (c - 1 + sorted.length) % sorted.length);
  const next = () => setCurrent((c) => (c + 1) % sorted.length);

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative overflow-hidden rounded-2xl bg-stone-100">
        <Image
          src={sorted[current].displayUrl ?? sorted[current].url}
          alt={`${title} — image ${current + 1}`}
          width={900}
          height={600}
          className="w-full object-contain max-h-[60vh]"
          priority={current === 0}
          sizes="(max-width: 768px) 100vw, 50vw"
        />
        {sorted.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white transition-colors"
            >
              ‹
            </button>
            <button
              onClick={next}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white transition-colors"
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* Dot / thumbnail strip */}
      {sorted.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sorted.map((img, idx) => (
            <button
              key={img.url}
              onClick={() => setCurrent(idx)}
              aria-label={`View image ${idx + 1}`}
              className={`shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                idx === current ? "border-stone-900" : "border-transparent hover:border-stone-400"
              }`}
            >
              <Image
                src={img.url}
                alt={`${title} thumbnail ${idx + 1}`}
                width={72}
                height={56}
                className="h-14 w-[72px] object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
