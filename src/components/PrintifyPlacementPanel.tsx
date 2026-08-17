"use client";

import { useRef, useState, useTransition } from "react";
import {
  confirmPrintifyPlacementAction,
  resetPrintifyPlacementAction,
} from "@/app/actions/apparel";
import {
  type Placement,
  defaultPlacement,
  movePlacement,
  scalePlacement,
  rotatePlacement,
} from "@/lib/apparel/placement-geometry";

export interface PrintifyPlacementPanelProps {
  listingId: string;
  /** The seller's clean design file; the thing being positioned. */
  designUrl: string | null;
  /** Captured front print-area pixel dims (US-MFTF-17.7); null → tool unavailable. */
  printArea: { width: number; height: number } | null;
  /** Product-type stock image for a garment backdrop (US-MFTF-17.6); optional. */
  stockImageUrl: string | null;
  /** Currently-saved placement, or null for a listing that opens at centred default. */
  initialPlacement: Placement | null;
}

/**
 * Edit-page panel for the seller design-placement tool (US-MFTF-17.8), following the
 * PrintFramingPanel precedent. Gated (by the page) to DESIGNED Printify listings; when
 * the product type has no captured `printifyPrintAreas.front` it shows a "not available
 * yet" state instead of erroring. All drag geometry lives in the pure
 * `placement-geometry` module — the tool below only wires pointer events to it.
 */
export default function PrintifyPlacementPanel({
  listingId,
  designUrl,
  printArea,
  stockImageUrl,
  initialPlacement,
}: PrintifyPlacementPanelProps) {
  return (
    <section
      data-testid="printify-placement-panel"
      className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-stone-800">Design placement</h2>
        <p className="mt-1 text-xs text-stone-500">
          Drag to position, resize, and rotate your design on the front of the garment.
          Leave it centred to keep the default placement.
        </p>
      </div>
      {printArea ? (
        <PlacementTool
          listingId={listingId}
          designUrl={designUrl}
          printArea={printArea}
          stockImageUrl={stockImageUrl}
          initialPlacement={initialPlacement}
        />
      ) : (
        <p data-testid="placement-unavailable" className="text-xs text-stone-400">
          Placement isn’t available for this product yet — sync the product type from
          Printify to capture its print area.
        </p>
      )}
    </section>
  );
}

type DragMode = "move" | "resize" | "rotate";

function PlacementTool({
  listingId,
  designUrl,
  printArea,
  stockImageUrl,
  initialPlacement,
}: {
  listingId: string;
  designUrl: string | null;
  printArea: { width: number; height: number };
  stockImageUrl: string | null;
  initialPlacement: Placement | null;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement>(initialPlacement ?? defaultPlacement());
  const [drag, setDrag] = useState<{ mode: DragMode; startX: number; startY: number; start: Placement } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function surfaceSize() {
    const r = surfaceRef.current?.getBoundingClientRect();
    return { w: r?.width || 1, h: r?.height || 1 };
  }

  function begin(mode: DragMode, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ mode, startX: e.clientX, startY: e.clientY, start: placement });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const { w, h } = surfaceSize();
    const dx = (e.clientX - drag.startX) / w;
    const dy = (e.clientY - drag.startY) / h;
    if (drag.mode === "move") setPlacement(movePlacement(drag.start, dx, dy));
    else if (drag.mode === "resize") setPlacement(scalePlacement(drag.start, dx));
    else setPlacement(rotatePlacement(drag.start, dx * 180));
  }

  function endDrag() {
    setDrag(null);
  }

  function confirm() {
    setMessage(null);
    startTransition(async () => {
      const result = await confirmPrintifyPlacementAction(listingId, placement);
      if (result && "error" in result) setMessage({ type: "error", text: result.error });
      else setMessage({ type: "success", text: "Placement saved." });
    });
  }

  function reset() {
    setMessage(null);
    startTransition(async () => {
      const result = await resetPrintifyPlacementAction(listingId);
      if (result && "error" in result) {
        setMessage({ type: "error", text: result.error });
      } else {
        setPlacement(defaultPlacement());
        setMessage({ type: "success", text: "Reset to centered." });
      }
    });
  }

  const designStyle: React.CSSProperties = {
    left: `${placement.x * 100}%`,
    top: `${placement.y * 100}%`,
    width: `${placement.scale * 100}%`,
    transform: `translate(-50%, -50%) rotate(${placement.angle}deg)`,
  };

  return (
    <div className="space-y-3">
      <div
        ref={surfaceRef}
        data-testid="placement-surface"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="relative mx-auto w-full max-w-sm select-none touch-none overflow-hidden rounded-lg border border-stone-200 bg-stone-100"
        style={{ aspectRatio: `${printArea.width} / ${printArea.height}` }}
      >
        {stockImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stockImageUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-60"
          />
        )}
        {designUrl && (
          <div
            data-testid="placement-design"
            data-x={placement.x}
            data-y={placement.y}
            data-scale={placement.scale}
            data-angle={placement.angle}
            role="group"
            aria-label="Design placement"
            onPointerDown={(e) => begin("move", e)}
            className="absolute cursor-move"
            style={designStyle}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={designUrl} alt="Your design" draggable={false} className="pointer-events-none block w-full" />
            <button
              type="button"
              data-testid="placement-resize-handle"
              aria-label="Resize design"
              onPointerDown={(e) => begin("resize", e)}
              className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-full border border-stone-400 bg-white"
            />
            <button
              type="button"
              data-testid="placement-rotate-handle"
              aria-label="Rotate design"
              onPointerDown={(e) => begin("rotate", e)}
              className="absolute -top-2 -right-2 h-4 w-4 cursor-grab rounded-full border border-stone-400 bg-white"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="confirm-placement"
          onClick={confirm}
          disabled={isPending}
          className="rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Confirm placement"}
        </button>
        <button
          type="button"
          data-testid="reset-placement"
          onClick={reset}
          disabled={isPending}
          className="rounded-full border border-stone-300 px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 transition-colors"
        >
          Reset to centered
        </button>
        <span className="text-xs text-stone-500">
          Scale {Math.round(placement.scale * 100)}% · {Math.round(placement.angle)}°
        </span>
        {message && (
          <span className={`text-xs ${message.type === "error" ? "text-rose-600" : "text-emerald-700"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
