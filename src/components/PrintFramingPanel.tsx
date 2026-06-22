"use client";

import { useState } from "react";
import CanvasWrapPicker from "@/components/CanvasWrapPicker";
import FramingTool from "@/components/FramingTool";
import type { CanvasWrap } from "@/generated/prisma/client";
import type { CropRect } from "@/lib/print/crop-geometry";

export interface FramingAspect {
  aspectRatio: string;
  isCanvas: boolean;
  wrap: CanvasWrap | null;
  croppedUrl: string | null;
  needsReframe: boolean;
  rect: CropRect | null;
}

interface PrintFramingPanelProps {
  listingId: string;
  sourceUrl: string | null;
  aspects: FramingAspect[];
}

/**
 * Per-aspect print framing controls on the listing edit page (Epic MFTF-PF). One
 * card per offered print aspect: canvas aspects show the edge-wrap picker
 * (US-MFTF-PF.2); every aspect gets the interactive crop tool (US-MFTF-PF.3). The
 * readiness banner (PF.4) and mockup uploads (PF.6) compose alongside in their stories.
 */
export default function PrintFramingPanel({ listingId, sourceUrl, aspects }: PrintFramingPanelProps) {
  const [openAspect, setOpenAspect] = useState<string | null>(null);
  if (aspects.length === 0) return null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
      <h2 className="text-sm font-semibold text-stone-800">Print framing</h2>
      <div className="space-y-3">
        {aspects.map((aspect) => {
          const open = openAspect === aspect.aspectRatio;
          const framed = !!aspect.croppedUrl && !aspect.needsReframe;
          return (
            <div key={aspect.aspectRatio} className="rounded-xl border border-stone-200 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-stone-700">
                  {aspect.aspectRatio} {aspect.isCanvas ? "· canvas" : "· paper"}
                </span>
                <span
                  className={`text-xs font-medium ${
                    framed ? "text-emerald-700" : aspect.needsReframe ? "text-amber-600" : "text-stone-400"
                  }`}
                >
                  {framed ? "Framed" : aspect.needsReframe ? "Needs reframe" : "Not framed"}
                </span>
              </div>

              {aspect.isCanvas && (
                <CanvasWrapPicker listingId={listingId} aspectRatio={aspect.aspectRatio} initialWrap={aspect.wrap} />
              )}

              {sourceUrl ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenAspect(open ? null : aspect.aspectRatio)}
                    className="text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors"
                  >
                    {open ? "Close framing tool" : framed ? "Re-frame" : "Frame this aspect"}
                  </button>
                  {open && (
                    <div className="mt-3">
                      <FramingTool
                        listingId={listingId}
                        aspectRatio={aspect.aspectRatio}
                        sourceUrl={sourceUrl}
                        initialRect={aspect.rect}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-stone-400">Set a print source image to frame this aspect.</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
