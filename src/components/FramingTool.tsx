"use client";

import { useRef, useState, useTransition } from "react";
import { confirmFramingAction } from "@/app/actions/listings";
import {
  type CropRect,
  defaultCropRect,
  clampRect,
  moveRect,
  withWidth,
  invertAspect,
  orientedAspect,
  variantForPixelAspect,
  cropPixelAspect,
  parseAspect,
} from "@/lib/print/crop-geometry";

interface FramingToolProps {
  listingId: string;
  aspectRatio: string;
  sourceUrl: string;
  /** Stored crop rect to pre-load when re-opening an already-framed aspect. */
  initialRect?: CropRect | null;
  onConfirmed?: () => void;
}

type DragMode = "move" | "resize" | null;

/**
 * Interactive crop box locked to one print aspect, overlaid on the source art
 * (US-MFTF-PF.3). All geometry (aspect-lock, bounds clamping, rect math) lives in
 * the pure `crop-geometry` module — this component only translates pointer events
 * into normalized-rect updates and posts the confirmed rect. The crop box cannot
 * leave the image or invert (enforced by `clampRect`).
 */
export default function FramingTool({
  listingId,
  aspectRatio,
  sourceUrl,
  initialRect,
  onConfirmed,
}: FramingToolProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<CropRect | null>(initialRect ?? null);
  // The aspect the crop box is locked to: the SKU's nominal aspect or its inverse
  // (rotated). A print SKU prints in either orientation, so a landscape piece can be
  // framed landscape even on a portrait-named SKU. The PrintFraming row is still keyed
  // by the nominal `aspectRatio`; only the crop's orientation changes.
  const [activeAspect, setActiveAspect] = useState<string>(aspectRatio);
  const [drag, setDrag] = useState<{ mode: DragMode; startX: number; startY: number; startRect: CropRect } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // Square SKUs can't be rotated meaningfully.
  const canRotate = Math.abs(parseAspect(aspectRatio) - 1) > 1e-6;

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const el = e.currentTarget;
    const w = el.naturalWidth || 1;
    const h = el.naturalHeight || 1;
    setImgDims({ w, h });
    // Lock to the orientation the seller already framed (re-open), else the one that
    // matches the source image's orientation.
    const initialAspect = rect
      ? variantForPixelAspect(aspectRatio, cropPixelAspect(rect, w, h))
      : orientedAspect(aspectRatio, w, h);
    setActiveAspect(initialAspect);
    if (!rect) setRect(defaultCropRect(initialAspect, w, h));
  }

  function rotate() {
    if (!imgDims) return;
    const next = invertAspect(activeAspect);
    setActiveAspect(next);
    // Re-default the box to the rotated aspect (the old rect's proportions no longer fit).
    setRect(defaultCropRect(next, imgDims.w, imgDims.h));
  }

  function containerSize() {
    const el = containerRef.current;
    return el ? { w: el.clientWidth || 1, h: el.clientHeight || 1 } : { w: 1, h: 1 };
  }

  function beginDrag(mode: DragMode, e: React.PointerEvent) {
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ mode, startX: e.clientX, startY: e.clientY, startRect: rect });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag || !rect || !imgDims) return;
    const { w: cw, h: ch } = containerSize();
    const dx = (e.clientX - drag.startX) / cw;
    const dy = (e.clientY - drag.startY) / ch;
    if (drag.mode === "move") {
      setRect(moveRect(drag.startRect, dx, dy));
    } else if (drag.mode === "resize") {
      setRect(withWidth(drag.startRect, drag.startRect.w + dx, activeAspect, imgDims.w, imgDims.h));
    }
  }

  function endDrag() {
    if (drag && rect && imgDims) setRect(clampRect(rect, activeAspect, imgDims.w, imgDims.h));
    setDrag(null);
  }

  function confirm() {
    if (!rect) return;
    setMessage(null);
    startTransition(async () => {
      const result = await confirmFramingAction(listingId, aspectRatio, rect);
      if (result && "error" in result) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: "Framing saved." });
        onConfirmed?.();
      }
    });
  }

  const boxStyle = rect
    ? {
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
      }
    : undefined;

  return (
    <div className="space-y-3" data-testid={`framing-tool-${aspectRatio}`}>
      <div
        ref={containerRef}
        className="relative inline-block max-w-full select-none touch-none overflow-hidden rounded-lg bg-stone-100"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sourceUrl}
          alt="Print source"
          onLoad={onImageLoad}
          className="block max-h-[480px] w-auto max-w-full"
          draggable={false}
        />
        {rect && (
          <div
            data-testid="crop-box"
            role="group"
            aria-label={`Crop region for ${aspectRatio}`}
            onPointerDown={(e) => beginDrag("move", e)}
            className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={boxStyle}
          >
            <button
              type="button"
              data-testid="crop-resize-handle"
              aria-label="Resize crop"
              onPointerDown={(e) => beginDrag("resize", e)}
              className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-full border border-stone-400 bg-white"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="confirm-framing"
          onClick={confirm}
          disabled={isPending || !rect}
          className="rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Confirm framing"}
        </button>
        {canRotate && (
          <button
            type="button"
            data-testid="rotate-crop"
            onClick={rotate}
            disabled={isPending || !imgDims}
            className="rounded-full border border-stone-300 px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 transition-colors"
            title="Rotate the crop 90° — the print is produced in this orientation"
          >
            ↻ Rotate crop ({activeAspect})
          </button>
        )}
        {message && (
          <span className={`text-xs ${message.type === "error" ? "text-rose-600" : "text-emerald-700"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
