"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMockupBackgroundAction } from "@/app/actions/referenced-apparel";
import {
  MOCKUP_BACKGROUND_SWATCHES,
  resolveMockupBackground,
  type MockupBackgrounds,
} from "@/lib/apparel/mockup-background";

/**
 * Per-mockup background picker (US-MFTF-19.7). For each transparent Teemill
 * mockup (keyed by its colour), the seller picks one of five swatches; the choice
 * is composited behind the mockup at render time (the stored image is untouched).
 * The renderer treats the stored value as opaque, so the swatch set is purely a UI
 * concern here.
 */
export default function MockupBackgroundPicker({
  listingId,
  mockups,
  backgrounds,
}: {
  listingId: string;
  /** One entry per distinct mockup: its colour name + image URL. */
  mockups: { colorName: string; url: string }[];
  backgrounds: MockupBackgrounds | null;
}) {
  const [map, setMap] = useState<MockupBackgrounds>(backgrounds ?? {});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (mockups.length === 0) return null;

  function choose(colorName: string, value: string) {
    setMap((m) => ({ ...m, [colorName]: value }));
    startTransition(async () => {
      await setMockupBackgroundAction(listingId, colorName, value);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-stone-800">Mockup backgrounds</h2>
      <p className="text-xs text-stone-500">
        Teemill mockups have transparent backgrounds. Pick a backdrop for each — it shows behind
        the mockup on the product page; the image itself isn&apos;t changed.
      </p>
      <ul className="space-y-3">
        {mockups.map((mk) => {
          const active = resolveMockupBackground(map, mk.colorName);
          return (
            <li key={mk.colorName} className="flex items-center gap-4">
              <div
                className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-stone-200"
                style={{ backgroundColor: active }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mk.url} alt={`${mk.colorName} mockup preview`} className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-stone-600">{mk.colorName}</p>
                <div className="flex flex-wrap gap-1.5">
                  {MOCKUP_BACKGROUND_SWATCHES.map((sw) => {
                    const selected = active.toLowerCase() === sw.value.toLowerCase();
                    return (
                      <button
                        key={sw.value}
                        type="button"
                        disabled={pending}
                        onClick={() => choose(mk.colorName, sw.value)}
                        aria-label={`${mk.colorName} background: ${sw.label}`}
                        aria-pressed={selected}
                        title={sw.label}
                        className={`h-7 w-7 rounded-full border-2 transition-transform disabled:opacity-50 ${
                          selected ? "border-stone-900 ring-2 ring-stone-900/30" : "border-stone-200 hover:scale-105"
                        }`}
                        style={{ backgroundColor: sw.value }}
                      />
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
