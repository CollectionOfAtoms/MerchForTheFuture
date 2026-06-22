"use client";

import CanvasWrapPicker from "@/components/CanvasWrapPicker";
import type { CanvasWrap } from "@/generated/prisma/client";

export interface FramingAspect {
  aspectRatio: string;
  isCanvas: boolean;
  wrap: CanvasWrap | null;
}

interface PrintFramingPanelProps {
  listingId: string;
  aspects: FramingAspect[];
}

/**
 * Per-aspect print framing controls on the listing edit page (Epic MFTF-PF). One
 * card per offered print aspect. Canvas aspects show the edge-wrap picker
 * (US-MFTF-PF.2); the interactive crop tool (PF.3) and the readiness banner (PF.4)
 * compose into this panel in their stories.
 */
export default function PrintFramingPanel({ listingId, aspects }: PrintFramingPanelProps) {
  if (aspects.length === 0) return null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
      <h2 className="text-sm font-semibold text-stone-800">Print framing</h2>
      <div className="space-y-3">
        {aspects.map((aspect) => (
          <div key={aspect.aspectRatio} className="rounded-xl border border-stone-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-700">
                {aspect.aspectRatio} {aspect.isCanvas ? "· canvas" : "· paper"}
              </span>
            </div>
            {aspect.isCanvas && (
              <CanvasWrapPicker
                listingId={listingId}
                aspectRatio={aspect.aspectRatio}
                initialWrap={aspect.wrap}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
