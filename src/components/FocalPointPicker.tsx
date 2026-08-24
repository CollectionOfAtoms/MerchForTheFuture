"use client";

import { useRef, useState } from "react";
import { setImageFocalAction } from "@/app/actions/images";
import { focalToObjectPosition } from "@/lib/artworks/focal";

/**
 * US-18.4 — Seller control for the square browse-grid crop. The seller clicks or
 * drags a marker over the primary image to choose the focal point (each axis
 * 0..1); a live square preview shows the resulting tile. The point is saved to
 * the image on pointer release via `setImageFocalAction`.
 */
export default function FocalPointPicker({
  listingId,
  imageId,
  imageUrl,
  title,
  initialX = 0.5,
  initialY = 0.5,
}: {
  listingId: string;
  imageId: string;
  imageUrl: string;
  title: string;
  initialX?: number;
  initialY?: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [focal, setFocal] = useState({ x: initialX, y: initialY });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

  function pointToFocal(clientX: number, clientY: number) {
    const el = frameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setFocal({
      x: clamp01((clientX - r.left) / r.width),
      y: clamp01((clientY - r.top) / r.height),
    });
  }

  async function commit() {
    setStatus("saving");
    const result = await setImageFocalAction(listingId, imageId, focal.x, focal.y);
    setStatus("error" in result ? "error" : "saved");
  }

  const objectPosition = focalToObjectPosition(focal.x, focal.y);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {/* Editable image with draggable focal marker */}
      <div
        ref={frameRef}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          pointToFocal(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (dragging.current) pointToFocal(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
          void commit();
        }}
        className="relative w-full max-w-xs cursor-crosshair touch-none overflow-hidden rounded-2xl border border-tuscan-sun/30 bg-tuscan-sun/10 select-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={title} className="block w-full select-none" draggable={false} />
        <span
          aria-hidden
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cerulean/70 shadow"
          style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
        />
      </div>

      {/* Live square-crop preview + status */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-blue-slate">Grid tile preview</p>
        <div className="h-32 w-32 overflow-hidden rounded-2xl border border-tuscan-sun/30 bg-tuscan-sun/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition }} />
        </div>
        <p className="text-xs text-dark-cyan">
          Drag the dot to choose what stays centered in the square tile.
        </p>
        <p className="text-xs" aria-live="polite">
          {status === "saving" && <span className="text-muted">Saving…</span>}
          {status === "saved" && <span className="font-medium text-seagrass">Saved</span>}
          {status === "error" && <span className="font-medium text-strawberry-red">Couldn’t save — try again</span>}
        </p>
      </div>
    </div>
  );
}
