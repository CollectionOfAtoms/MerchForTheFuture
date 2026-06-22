"use client";

import { useState, useTransition } from "react";
import { setCanvasWrapAction } from "@/app/actions/listings";
import {
  SELECTABLE_CANVAS_WRAPS,
  DEFAULT_CANVAS_WRAP,
  WRAP_LABELS,
} from "@/lib/print/canvas-wrap";
import type { CanvasWrap } from "@/generated/prisma/client";

interface CanvasWrapPickerProps {
  listingId: string;
  aspectRatio: string;
  /** Stored wrap, or null/undefined to default to MirrorWrap. */
  initialWrap?: CanvasWrap | null;
}

/**
 * Edge-wrap picker for one offered canvas aspect (US-MFTF-PF.2). Offers exactly
 * {MirrorWrap, Black, White} — `IMAGE_WRAP` is never presented — defaulting to
 * MirrorWrap when nothing is stored. The choice persists to `PrintFraming.wrap`
 * independently of the crop. Paper aspects render no wrap control (the caller
 * gates on `isCanvas`).
 */
export default function CanvasWrapPicker({ listingId, aspectRatio, initialWrap }: CanvasWrapPickerProps) {
  const [wrap, setWrap] = useState<CanvasWrap>(initialWrap ?? DEFAULT_CANVAS_WRAP);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: CanvasWrap) {
    const prev = wrap;
    setWrap(next);
    setError(null);
    startTransition(async () => {
      const result = await setCanvasWrapAction(listingId, aspectRatio, next);
      if (result && "error" in result) {
        setWrap(prev);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid={`wrap-picker-${aspectRatio}`}>
      <span className="text-xs font-medium text-stone-600">Canvas edge wrap</span>
      <div role="radiogroup" aria-label={`Canvas edge wrap for ${aspectRatio}`} className="flex gap-2">
        {SELECTABLE_CANVAS_WRAPS.map((option) => {
          const selected = wrap === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isPending}
              onClick={() => choose(option)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                selected
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-300 text-stone-700 hover:bg-stone-50"
              }`}
            >
              {WRAP_LABELS[option]}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
