"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { setSizeMockupAction, removeSizeMockupAction } from "@/app/actions/listings";

export interface MockupSize {
  sku: string;
  label: string;
}

interface SizeMockupUploaderProps {
  listingId: string;
  sizes: MockupSize[];
  /** Existing mockup URLs keyed by size SKU. */
  initialMockups: Record<string, string>;
}

/**
 * Per-size buyer-mockup upload on the listing edit page (US-MFTF-PF.6). One control
 * per offered print size: upload / replace / remove. The image is stored in Blob and
 * persisted to `PrintSizeMockup` keyed by `[artworkId, sizeSku]`. These are buyer
 * DISPLAY assets — never sent to Prodigi, and uploaded as-is (no watermark; they are
 * promotional previews, not the protected original).
 */
export default function SizeMockupUploader({ listingId, sizes, initialMockups }: SizeMockupUploaderProps) {
  const [mockups, setMockups] = useState<Record<string, string>>(initialMockups);
  const [uploadingSku, setUploadingSku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingSku = useRef<string | null>(null);

  if (sizes.length === 0) return null;

  function trigger(sku: string) {
    pendingSku.current = sku;
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const sku = pendingSku.current;
    if (!file || !sku) return;
    setError(null);
    setUploadingSku(sku);
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const blob = await upload(`print-mockups/${listingId}/${sku}${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      const result = await setSizeMockupAction(listingId, sku, blob.url);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setMockups((prev) => ({ ...prev, [sku]: blob.url }));
      }
    } catch {
      setError("Mockup upload failed. Please try again.");
    } finally {
      setUploadingSku(null);
      pendingSku.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function remove(sku: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeSizeMockupAction(listingId, sku);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setMockups((prev) => {
          const next = { ...prev };
          delete next[sku];
          return next;
        });
      }
    });
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-stone-800">Buyer mockups</h2>
        <p className="mt-1 text-xs text-stone-400">
          Upload the preview a buyer sees for each size. These are display images only — they&apos;re never
          sent to the printer.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={onFile}
      />

      <div className="space-y-3">
        {sizes.map((size) => {
          const url = mockups[size.sku];
          const uploading = uploadingSku === size.sku;
          return (
            <div
              key={size.sku}
              data-testid={`mockup-row-${size.sku}`}
              className="flex items-center gap-4 rounded-xl border border-stone-200 p-3"
            >
              <span className="w-28 shrink-0 text-sm font-medium text-stone-700">{size.label}</span>
              {url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`${size.label} mockup`} className="h-14 w-20 rounded-lg border border-stone-200 object-cover" />
                  <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => trigger(size.sku)} disabled={uploading} className="text-xs text-stone-500 hover:text-stone-900 transition-colors">
                      {uploading ? "Uploading…" : "Replace"}
                    </button>
                    <button type="button" onClick={() => remove(size.sku)} className="text-xs text-rose-500 hover:text-rose-700 transition-colors">
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => trigger(size.sku)}
                  disabled={uploading}
                  className="rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-xs text-stone-500 hover:text-stone-900 transition-colors disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "+ Add mockup image"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </section>
  );
}
