"use client";

import { useState } from "react";

/**
 * Framed preview of the clean design file. PNG/SVG render directly; TIFF (an
 * accepted upload format) can't be shown by browsers, so we fall back to a
 * labelled placeholder rather than a broken image.
 *
 * Render with `key={url}` so a replaced design remounts with a fresh error state.
 */
export function DesignFilePreview({ url, className = "" }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`relative aspect-square w-32 shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-white p-2 shadow-inner ${className}`}
    >
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center text-stone-400">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <span className="text-[10px] font-medium">Design on file</span>
          <span className="text-[9px] leading-tight">preview unavailable</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Design preview"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
