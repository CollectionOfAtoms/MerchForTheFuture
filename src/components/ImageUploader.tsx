"use client";

import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { saveImageAction, deleteImageAction, setPrimaryImageAction, regenerateVariantsAction } from "@/app/actions/images";
import {
  validateUpload,
  ACCEPTED_UPLOAD_TYPES,
  UPLOAD_MAX_BYTES,
} from "@/lib/artworks/upload-validation";

type ProcessingState = "idle" | "uploading" | "processing" | "done" | "error";

interface ArtworkImage {
  id: string;
  url: string;
  displayUrl?: string | null;
  isPrimary: boolean;
  processingState?: ProcessingState;
}

export default function ImageUploader({
  listingId,
  initialImages,
}: {
  listingId: string;
  initialImages: ArtworkImage[];
}) {
  const [images, setImages] = useState<ArtworkImage[]>(
    initialImages.map((img) => ({ ...img, processingState: "done" }))
  );
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const anyProcessing = images.some(
    (img) => img.processingState === "uploading" || img.processingState === "processing"
  );
  const anyError = images.some((img) => img.processingState === "error");

  async function processImage(imageId: string) {
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, processingState: "processing" } : img))
    );
    try {
      const res = await fetch("/api/images/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      const body = await res.json();
      if (body.ok) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === imageId
              ? { ...img, displayUrl: body.displayUrl ?? null, processingState: "done" }
              : img
          )
        );
      } else {
        setImages((prev) =>
          prev.map((img) => (img.id === imageId ? { ...img, processingState: "error" } : img))
        );
        setError("Image processing failed. Please remove the image and try again.");
      }
    } catch {
      setImages((prev) =>
        prev.map((img) => (img.id === imageId ? { ...img, processingState: "error" } : img))
      );
      setError("Image processing failed. Please remove the image and try again.");
    }
  }

  // Process any images that were uploaded via the new-listing flow (no displayUrl yet)
  useEffect(() => {
    const unprocessed = initialImages.filter((img) => !img.displayUrl);
    for (const img of unprocessed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      processImage(img.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadProgress(0);

    const validation = validateUpload({ size: file.size, type: file.type });
    if (!validation.valid) {
      setError(validation.error);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setIsUploading(true);

    // Placeholder entry shown immediately while uploading
    const placeholderId = `uploading-${Date.now()}`;
    setImages((prev) => [
      ...prev,
      {
        id: placeholderId,
        url: "",
        isPrimary: prev.length === 0,
        processingState: "uploading",
      },
    ]);

    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const blob = await upload(`artworks/${listingId}/${crypto.randomUUID()}${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
      });

      // Save to DB — get back the imageId
      const saveResult = await saveImageAction(listingId, blob.url);
      if ("error" in saveResult) {
        setError(saveResult.error);
        setImages((prev) => prev.filter((img) => img.id !== placeholderId));
        return;
      }

      const imageId = saveResult.imageId;
      if (!imageId) {
        setError("Image save failed unexpectedly.");
        setImages((prev) => prev.filter((img) => img.id !== placeholderId));
        return;
      }

      // Transition to "processing" state
      setImages((prev) =>
        prev.map((img) =>
          img.id === placeholderId
            ? { ...img, id: imageId, url: blob.url, processingState: "processing" }
            : img
        )
      );

      await processImage(imageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setImages((prev) => prev.filter((img) => img.id !== placeholderId));
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(imageId: string) {
    const result = await deleteImageAction(listingId, imageId);
    if ("error" in result) {
      setError(result.error);
    } else {
      setImages((prev) => {
        const remaining = prev.filter((img) => img.id !== imageId);
        if (remaining.length > 0 && !remaining.some((img) => img.isPrimary)) {
          return remaining.map((img, i) => (i === 0 ? { ...img, isPrimary: true } : img));
        }
        return remaining;
      });
    }
  }

  async function handleRegenerate(imageId: string) {
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, processingState: "processing" } : img))
    );
    const result = await regenerateVariantsAction(listingId, imageId);
    if ("error" in result) {
      setImages((prev) =>
        prev.map((img) => (img.id === imageId ? { ...img, processingState: "error" } : img))
      );
      setError(result.error);
    } else {
      await processImage(imageId);
    }
  }

  async function handleSetPrimary(imageId: string) {
    const result = await setPrimaryImageAction(listingId, imageId);
    if ("error" in result) {
      setError(result.error);
    } else {
      setImages((prev) => prev.map((img) => ({ ...img, isPrimary: img.id === imageId })));
    }
  }

  const acceptAttr = ACCEPTED_UPLOAD_TYPES.join(",");
  const maxMB = Math.round(UPLOAD_MAX_BYTES / (1024 * 1024));

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((img) => (
            <div
              key={img.id}
              className={`relative h-28 w-28 rounded-xl overflow-hidden bg-stone-100 border-2 ${
                img.isPrimary ? "border-stone-900" : "border-transparent"
              }`}
            >
              {img.processingState === "uploading" || img.processingState === "processing" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-100 gap-1 p-2">
                  <svg
                    className="animate-spin h-5 w-5 text-stone-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-[10px] text-stone-500 text-center leading-tight">
                    {img.processingState === "uploading" ? "Uploading…" : "Processing…"}
                  </span>
                  {img.processingState === "uploading" && uploadProgress > 0 && (
                    <div className="w-full bg-stone-200 rounded-full h-1">
                      <div
                        className="bg-stone-600 h-1 rounded-full transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              ) : img.processingState === "error" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-red-50">
                  <span className="text-[10px] text-red-500 text-center px-1">Processing failed</span>
                </div>
              ) : (
                img.url && (
                  <Image
                    src={img.displayUrl ?? img.url}
                    alt="Artwork"
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="112px"
                  />
                )
              )}

              {img.processingState === "done" && (
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 px-1.5 py-1">
                  {img.isPrimary ? (
                    <span className="text-[10px] text-white font-medium">Primary</span>
                  ) : (
                    <button
                      type="button"
                      disabled={anyProcessing}
                      onClick={() => handleSetPrimary(img.id)}
                      className="text-[10px] text-stone-300 hover:text-white transition-colors disabled:opacity-50"
                    >
                      Set primary
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={anyProcessing}
                    onClick={() => handleRegenerate(img.id)}
                    aria-label="Regenerate variants"
                    className="text-[10px] text-stone-300 hover:text-white transition-colors disabled:opacity-50"
                  >
                    ↺
                  </button>
                  {images.length > 1 && (
                    <button
                      type="button"
                      disabled={anyProcessing}
                      onClick={() => handleDelete(img.id)}
                      aria-label="Delete image"
                      className="text-[10px] text-rose-300 hover:text-rose-100 transition-colors disabled:opacity-50"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hidden submit blocker: signals to parent form that images are not ready */}
      {(anyProcessing || anyError) && (
        <input type="hidden" name="_imagesNotReady" value="true" />
      )}

      <label
        className={`inline-flex items-center gap-2 cursor-pointer rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:border-stone-500 hover:text-stone-900 transition-colors ${
          isUploading ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {isUploading ? "Uploading…" : "Add photo"}
        <input
          ref={fileRef}
          type="file"
          accept={acceptAttr}
          className="sr-only"
          onChange={handleFileChange}
          disabled={isUploading || anyProcessing}
        />
      </label>
      <p className="text-xs text-stone-400">
        JPEG, PNG, TIFF, or WebP · max {maxMB} MB · first image is shown as primary
      </p>
    </div>
  );
}
