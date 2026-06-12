"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { updateProductTypeBlankImageAction } from "@/app/actions/admin/product-catalog";

interface Props {
  productTypeId: string;
  currentImageUrl: string | null;
}

export default function BlankImageUploader({ productTypeId, currentImageUrl }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(currentImageUrl);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setProgress(0);

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Please upload a JPEG, PNG, or WebP image.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Image must be under 20 MB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const blob = await upload(
        `product-blanks/${productTypeId}/${crypto.randomUUID()}${ext}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
        },
      );

      startTransition(async () => {
        const result = await updateProductTypeBlankImageAction(productTypeId, blob.url);
        if ("error" in result) {
          setError(result.error);
        } else {
          setImageUrl(blob.url);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await updateProductTypeBlankImageAction(productTypeId, null);
      if ("error" in result) {
        setError(result.error);
      } else {
        setImageUrl(null);
      }
    });
  }

  const busy = uploading || isPending;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      {imageUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 aspect-square w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Product blank" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-3 py-2">
            <label
              className={`cursor-pointer text-xs text-white hover:text-stone-200 transition-colors ${busy ? "opacity-50 pointer-events-none" : ""}`}
            >
              Replace
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleFileChange}
                disabled={busy}
              />
            </label>
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="text-xs text-rose-300 hover:text-rose-100 transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label
          className={`flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 hover:border-stone-400 hover:bg-stone-100 transition-colors ${
            busy ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          {uploading ? (
            <>
              <svg className="animate-spin h-6 w-6 text-stone-400" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm text-stone-500">Uploading… {progress}%</span>
            </>
          ) : (
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-stone-400">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span className="text-sm text-stone-500">Upload product blank</span>
              <span className="text-xs text-stone-400">JPEG, PNG, or WebP · max 20 MB</span>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={handleFileChange}
            disabled={busy}
          />
        </label>
      )}
    </div>
  );
}
