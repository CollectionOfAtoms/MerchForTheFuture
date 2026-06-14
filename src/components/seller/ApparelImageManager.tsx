"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  addApparelImageAction,
  deleteApparelImageAction,
  setApparelPrimaryImageAction,
  replaceApparelDesignAction,
} from "@/app/actions/apparel";
import { DesignFilePreview } from "@/components/seller/DesignFilePreview";

type ProcessingState = "idle" | "uploading" | "processing" | "done" | "error";

interface LifestyleImage {
  id: string;
  originalUrl: string;
  displayUrl?: string | null;
  isPrimary: boolean;
  processingState?: ProcessingState;
}

const LIFESTYLE_ACCEPT = "image/jpeg,image/png,image/tiff,image/webp";
const DESIGN_ACCEPT = "image/png,image/svg+xml,image/tiff";
const MAX_LIFESTYLE = 10;

export default function ApparelImageManager({
  listingId,
  initialImages,
  designImageUrl,
  showDesignFile = true,
  refreshOnChange = false,
}: {
  listingId: string;
  initialImages: LifestyleImage[];
  designImageUrl: string | null;
  /** Designed listings show the clean design-file uploader; referenced listings don't. */
  showDesignFile?: boolean;
  /** Refresh server data after a change (so a sibling carousel re-reads it). */
  refreshOnChange?: boolean;
}) {
  const router = useRouter();
  const [images, setImages] = useState<LifestyleImage[]>(
    initialImages.map((img) => ({ ...img, processingState: "done" })),
  );

  function notifyChanged() {
    if (refreshOnChange) router.refresh();
  }
  const [design, setDesign] = useState<string | null>(designImageUrl);
  const [designUploading, setDesignUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const designRef = useRef<HTMLInputElement>(null);

  const anyProcessing = images.some(
    (img) => img.processingState === "uploading" || img.processingState === "processing",
  );

  async function processImage(imageId: string) {
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, processingState: "processing" } : img)),
    );
    try {
      const res = await fetch("/api/apparel/images/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apparelImageId: imageId }),
      });
      const body = await res.json();
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? {
                ...img,
                displayUrl: body.ok ? body.displayUrl ?? null : img.displayUrl,
                processingState: body.ok ? "done" : "error",
              }
            : img,
        ),
      );
      if (!body.ok) setError("Photo processing failed. Remove it and try again.");
      else notifyChanged();
    } catch {
      setImages((prev) =>
        prev.map((img) => (img.id === imageId ? { ...img, processingState: "error" } : img)),
      );
      setError("Photo processing failed. Remove it and try again.");
    }
  }

  // Generate variants for any lifestyle photo created without one (e.g. just
  // added on the create form before reaching this page).
  useEffect(() => {
    const unprocessed = initialImages.filter((img) => !img.displayUrl);
    for (const img of unprocessed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      processImage(img.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (images.length >= MAX_LIFESTYLE) {
      setError(`You can upload at most ${MAX_LIFESTYLE} lifestyle photos.`);
      return;
    }
    setIsUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const blob = await upload(`apparel/lifestyle/${crypto.randomUUID()}${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      const result = await addApparelImageAction(listingId, blob.url);
      if ("error" in result || !result.imageId) {
        setError("error" in result ? result.error : "Could not add photo.");
        return;
      }
      const imageId = result.imageId;
      setImages((prev) => [
        ...prev,
        { id: imageId, originalUrl: blob.url, isPrimary: prev.length === 0, processingState: "processing" },
      ]);
      await processImage(imageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(imageId: string) {
    const result = await deleteApparelImageAction(listingId, imageId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setImages((prev) => {
      const remaining = prev.filter((img) => img.id !== imageId);
      if (remaining.length > 0 && !remaining.some((img) => img.isPrimary)) {
        return remaining.map((img, i) => (i === 0 ? { ...img, isPrimary: true } : img));
      }
      return remaining;
    });
    notifyChanged();
  }

  async function handleSetPrimary(imageId: string) {
    const result = await setApparelPrimaryImageAction(listingId, imageId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setImages((prev) => prev.map((img) => ({ ...img, isPrimary: img.id === imageId })));
    notifyChanged();
  }

  async function handleReplaceDesign(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDesignUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const blob = await upload(`apparel/design/${crypto.randomUUID()}${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      const result = await replaceApparelDesignAction(listingId, blob.url);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDesign(blob.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setDesignUploading(false);
      if (designRef.current) designRef.current.value = "";
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
      )}

      {/* Design file — designed listings only (referenced listings have no design file). */}
      {showDesignFile && (
      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">Design file</h2>
        <p className="text-xs text-stone-400">
          The clean artwork sent to the printer — never shown to buyers. Replacing it does not affect your photos.
        </p>
        <div className="flex items-center gap-4">
          {design ? (
            <DesignFilePreview key={design} url={design} />
          ) : (
            <div className="flex aspect-square w-32 shrink-0 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 text-xs text-stone-400">
              No design file
            </div>
          )}
          <label
            className={`cursor-pointer text-xs text-stone-600 hover:text-stone-900 ${
              designUploading ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {designUploading ? "Uploading…" : "Replace"}
            <input
              ref={designRef}
              type="file"
              accept={DESIGN_ACCEPT}
              className="sr-only"
              onChange={handleReplaceDesign}
              disabled={designUploading}
            />
          </label>
        </div>
      </section>
      )}

      {/* Lifestyle photos */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-stone-800">Lifestyle photos</h2>

        {images.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {images.map((img) => {
              const previewUrl = img.displayUrl ?? img.originalUrl;
              return (
                <div
                  key={img.id}
                  className={`relative h-32 w-32 overflow-hidden rounded-xl border-2 bg-stone-100 ${
                    img.isPrimary ? "border-stone-900" : "border-transparent"
                  }`}
                >
                  {img.processingState === "uploading" || img.processingState === "processing" ? (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-stone-500">
                      Processing…
                    </div>
                  ) : img.processingState === "error" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-[10px] text-red-500">
                      Failed
                    </div>
                  ) : (
                    // object-contain (not cover) so the bottom-right corner watermark is
                    // never cropped; click opens the full watermarked display variant.
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" title="Open full image" className="absolute inset-0">
                      <Image src={previewUrl} alt="Lifestyle photo" fill unoptimized className="object-contain" sizes="128px" />
                    </a>
                  )}
                  {img.processingState === "done" && (
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/50 px-1.5 py-1">
                      {img.isPrimary ? (
                        <span className="text-[10px] font-medium text-white">Primary</span>
                      ) : (
                        <button
                          type="button"
                          disabled={anyProcessing}
                          onClick={() => handleSetPrimary(img.id)}
                          className="text-[10px] text-stone-300 hover:text-white disabled:opacity-50"
                        >
                          Set primary
                        </button>
                      )}
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={anyProcessing}
                          onClick={() => processImage(img.id)}
                          aria-label="Regenerate watermark"
                          title="Regenerate watermark"
                          className="text-[12px] leading-none text-stone-300 hover:text-white disabled:opacity-50"
                        >
                          ↺
                        </button>
                        <button
                          type="button"
                          disabled={anyProcessing}
                          onClick={() => handleDelete(img.id)}
                          aria-label="Delete photo"
                          title="Delete photo"
                          className="text-[10px] text-rose-300 hover:text-rose-100 disabled:opacity-50"
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:border-stone-500 ${
            isUploading || images.length >= MAX_LIFESTYLE ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          {isUploading ? "Uploading…" : "Add photo"}
          <input
            ref={fileRef}
            type="file"
            accept={LIFESTYLE_ACCEPT}
            className="sr-only"
            onChange={handleAddPhoto}
            disabled={isUploading || anyProcessing || images.length >= MAX_LIFESTYLE}
          />
        </label>
        <p className="text-xs text-stone-400">Up to {MAX_LIFESTYLE} photos · a small corner watermark is added automatically · click a photo to view it full-size · ↺ regenerates the watermark.</p>
      </section>
    </div>
  );
}
