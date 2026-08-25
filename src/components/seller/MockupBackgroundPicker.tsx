"use client";

import { useRef, useTransition } from "react";
import { setMockupBackgroundAction } from "@/app/actions/referenced-apparel";
import {
  MOCKUP_BACKGROUND_SWATCHES,
  resolveMockupBackground,
  isBackgroundImage,
  type MockupBackgrounds,
} from "@/lib/apparel/mockup-background";
import { BACKGROUND_DESIGNS } from "@/lib/apparel/background-designs";

/**
 * Per-mockup background picker (US-MFTF-19.7). For each referenced mockup with a
 * transparent background (Teemill, or a Printify product whose mockups are transparent),
 * keyed by its colour, the seller picks a colour swatch, a free colour (colour
 * picker), or a design thumbnail; the choice composites behind the mockup at render
 * time (the stored image is untouched). Controlled: the parent owns the background
 * map so the edit page's preview carousel updates live as the seller drags the
 * colour picker; changes persist on commit (swatch/design click, or colour-picker
 * blur). The renderer treats the stored value as opaque — a colour or an image URL.
 */
export default function MockupBackgroundPicker({
  listingId,
  mockups,
  backgrounds,
  onChange,
}: {
  listingId: string;
  /** One entry per distinct mockup: its colour name + image URL. */
  mockups: { colorName: string; url: string }[];
  backgrounds: MockupBackgrounds;
  onChange: (next: MockupBackgrounds) => void;
}) {
  const [pending, startTransition] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (mockups.length === 0) return null;

  // Live: update the shared map (drives the preview) without saving.
  const setLive = (colorName: string, value: string) => onChange({ ...backgrounds, [colorName]: value });
  const save = (colorName: string, value: string) =>
    startTransition(async () => {
      await setMockupBackgroundAction(listingId, colorName, value);
    });
  // Commit immediately (swatches / designs).
  const persist = (colorName: string, value: string) => {
    setLive(colorName, value);
    save(colorName, value);
  };
  // The colour picker fires continuously while dragging: preview live, then save
  // shortly after the last change (so it persists even if the native popup closes
  // without the input blurring).
  const onColorInput = (colorName: string, value: string) => {
    setLive(colorName, value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(colorName, value), 350);
  };

  const btn = (selected: boolean) =>
    `h-7 w-7 overflow-hidden rounded-full border-2 transition-transform disabled:opacity-50 ${
      selected ? "border-stone-900 ring-2 ring-stone-900/30" : "border-stone-200 hover:scale-105"
    }`;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-stone-800">Mockup backgrounds</h2>
      <p className="text-xs text-stone-500">
        When a mockup has a transparent background, your chosen backdrop shows behind it on the
        product page. Pick one for each — the mockup image itself isn&apos;t changed.
      </p>
      <ul className="space-y-3">
        {mockups.map((mk) => {
          const active = resolveMockupBackground(backgrounds, mk.colorName);
          const activeIsImage = isBackgroundImage(active);
          return (
            <li key={mk.colorName} className="flex items-center gap-4">
              <div
                className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-stone-200"
                style={
                  activeIsImage
                    ? { backgroundImage: `url("${active}")`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { backgroundColor: active }
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mk.url} alt={`${mk.colorName} mockup preview`} className="h-full w-full object-contain" />
              </div>

              <div className="min-w-0 space-y-2">
                <p className="text-xs font-medium text-stone-600">{mk.colorName}</p>

                {/* Row 1 — colours (preset swatches + a free colour picker). */}
                <div className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-[11px] text-stone-400">Color</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {MOCKUP_BACKGROUND_SWATCHES.map((sw) => (
                      <button
                        key={sw.value}
                        type="button"
                        disabled={pending}
                        onClick={() => persist(mk.colorName, sw.value)}
                        aria-label={`${mk.colorName} background: ${sw.label}`}
                        aria-pressed={active.toLowerCase() === sw.value.toLowerCase()}
                        title={sw.label}
                        className={btn(active.toLowerCase() === sw.value.toLowerCase())}
                        style={{ backgroundColor: sw.value }}
                      />
                    ))}
                    {/* Free colour picker — live-updates the preview while dragging,
                        then auto-saves shortly after the last change (and on blur).
                        Uncontrolled (defaultValue only) so re-renders during the drag
                        don't reset the native picker; it re-seeds from the stored
                        value on the next page load. */}
                    <input
                      type="color"
                      disabled={pending}
                      aria-label={`${mk.colorName} custom background color`}
                      title="Custom color"
                      defaultValue={activeIsImage ? "#ffffff" : active}
                      onChange={(e) => onColorInput(mk.colorName, e.target.value)}
                      onBlur={(e) => {
                        if (saveTimer.current) clearTimeout(saveTimer.current);
                        persist(mk.colorName, e.target.value);
                      }}
                      className="h-7 w-7 cursor-pointer rounded-full border-2 border-stone-200 bg-transparent p-0 hover:scale-105"
                    />
                  </div>
                </div>

                {/* Row 2 — design images (assets/backgrounds via process-backgrounds.ts). */}
                {BACKGROUND_DESIGNS.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[11px] text-stone-400">Design</span>
                    <div className="flex flex-wrap gap-1.5">
                      {BACKGROUND_DESIGNS.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          disabled={pending}
                          onClick={() => persist(mk.colorName, d.fullUrl)}
                          aria-label={`${mk.colorName} background: ${d.label}`}
                          aria-pressed={active === d.fullUrl}
                          title={d.label}
                          className={btn(active === d.fullUrl)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={d.thumbUrl} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
