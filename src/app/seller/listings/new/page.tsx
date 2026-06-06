"use client";

import { useActionState, useState, useRef, useTransition } from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { createListingAction } from "@/app/actions/listings";
import { validateUpload, ACCEPTED_UPLOAD_TYPES, UPLOAD_MAX_BYTES } from "@/lib/artworks/upload-validation";

type SaleType = "FIXED_PRICE" | "AUCTION";

const FIELD = "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none w-full";
const LABEL = "block text-xs font-medium text-stone-600 mb-1.5";

export default function NewListingPage() {
  const [saleType, setSaleType] = useState<SaleType>("FIXED_PRICE");
  const [state, action, pending] = useActionState(createListingAction, undefined as { error: string } | undefined);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  // Stable date values computed once on mount to avoid hydration mismatches
  const [currentYear] = useState(() => new Date().getFullYear());
  const [minAuctionEnd] = useState(() =>
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );

  const maxMB = Math.round(UPLOAD_MAX_BYTES / (1024 * 1024));

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadProgress(0);

    const validation = validateUpload({ size: file.size, type: file.type });
    if (!validation.valid) {
      setUploadError(validation.error);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    startUpload(async () => {
      try {
        const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
        const blob = await upload(`artworks/${crypto.randomUUID()}${ext}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
        });
        setImageUrls((prev) => [...prev, blob.url]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploadProgress(0);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  function removeImage(url: string) {
    setImageUrls((prev) => prev.filter((u) => u !== url));
  }

  const canSubmit = !pending && !isUploading && imageUrls.length > 0;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-900">New listing</h1>
        <p className="mt-1 text-sm text-stone-500">Fill in the details below to publish your artwork.</p>
      </div>

      {state && "error" in state && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <form action={action} className="space-y-8">
        {/* Sale type selector */}
        <div>
          <p className={LABEL}>Listing type</p>
          <div className="grid grid-cols-2 gap-3">
            {(["FIXED_PRICE", "AUCTION"] as const).map((type) => (
              <label
                key={type}
                className={`flex cursor-pointer flex-col rounded-xl border p-4 transition-colors ${
                  saleType === type
                    ? "border-stone-900 bg-stone-50"
                    : "border-stone-200 bg-white hover:border-stone-300"
                }`}
              >
                <input
                  type="radio"
                  name="saleType"
                  value={type}
                  checked={saleType === type}
                  onChange={() => setSaleType(type)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-stone-900">
                  {type === "FIXED_PRICE" ? "Fixed price" : "Auction"}
                </span>
                <span className="mt-1 text-xs text-stone-500">
                  {type === "FIXED_PRICE"
                    ? "Set your price and sell directly."
                    : "Set a start bid and let buyers compete."}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Photos */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-stone-800">
            Photos <span className="text-red-400">*</span>
          </h2>

          {imageUrls.map((url) => (
            <input key={url} type="hidden" name="imageUrl" value={url} />
          ))}

          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {imageUrls.map((url, i) => (
                <div
                  key={url}
                  className={`relative h-28 w-28 rounded-xl overflow-hidden bg-stone-100 border-2 ${
                    i === 0 ? "border-stone-900" : "border-transparent"
                  }`}
                >
                  {failedThumbnails.has(url) ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-100 gap-1">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stone-400" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      <span className="text-[9px] text-stone-400 uppercase tracking-wide">Photo added</span>
                    </div>
                  ) : (
                    <Image
                      src={url}
                      alt={`Upload ${i + 1}`}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="112px"
                      onError={() => setFailedThumbnails((prev) => new Set(prev).add(url))}
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 px-1.5 py-1">
                    {i === 0 && (
                      <span className="text-[10px] text-white font-medium">Primary</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(url)}
                      className="ml-auto text-[10px] text-rose-300 hover:text-rose-100 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {uploadError && (
            <p className="text-sm text-red-600">{uploadError}</p>
          )}

          <label
            className={`inline-flex items-center gap-2 cursor-pointer rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:border-stone-500 hover:text-stone-900 transition-colors ${
              isUploading ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {isUploading ? "Uploading…" : "Add photo"}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_UPLOAD_TYPES.join(",")}
              className="sr-only"
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </label>
          {isUploading && uploadProgress > 0 && (
            <div className="w-48 bg-stone-200 rounded-full h-1.5">
              <div
                className="bg-stone-600 h-1.5 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          <p className="text-xs text-stone-400">JPEG, PNG, TIFF, or WebP · max {maxMB} MB · first image shown as primary</p>
        </section>

        {/* Artwork details */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
          <h2 className="text-sm font-semibold text-stone-800">Artwork details</h2>

          <div>
            <label htmlFor="title" className={LABEL}>Title <span className="text-red-400">*</span></label>
            <input id="title" name="title" type="text" required placeholder="e.g. Coastal Horizon" className={FIELD} />
          </div>

          <div>
            <label htmlFor="artist" className={LABEL}>Artist <span className="text-red-400">*</span></label>
            <input id="artist" name="artist" type="text" required placeholder="e.g. Georgia O'Keeffe" className={FIELD} />
          </div>

          <div>
            <label htmlFor="description" className={LABEL}>Description <span className="text-red-400">*</span></label>
            <textarea
              id="description"
              name="description"
              required
              rows={4}
              placeholder="Tell buyers about this work — materials, inspiration, size, framing…"
              className={`${FIELD} resize-none`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="medium" className={LABEL}>Medium <span className="text-red-400">*</span></label>
              <input id="medium" name="medium" type="text" required placeholder="e.g. Oil on canvas" className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Dimensions <span className="text-red-400">*</span></label>
              <div className="flex items-center gap-2">
                <input
                  id="dimensionW"
                  name="dimensionW"
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  placeholder="W"
                  className={`${FIELD} min-w-0`}
                />
                <span className="shrink-0 text-sm text-stone-400">×</span>
                <input
                  id="dimensionH"
                  name="dimensionH"
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  placeholder="H"
                  className={`${FIELD} min-w-0`}
                />
                <select name="dimensionUnit" defaultValue="in" className="shrink-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 focus:border-stone-400 focus:outline-none">
                  <option value="in">in</option>
                  <option value="cm">cm</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="year" className={LABEL}>Year created</label>
              <input
                id="year"
                name="year"
                type="number"
                min="1900"
                max={currentYear}
                defaultValue={currentYear}
                className={FIELD}
              />
            </div>
          </div>
        </section>

        {/* Pricing / Auction settings */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
          <h2 className="text-sm font-semibold text-stone-800">
            {saleType === "FIXED_PRICE" ? "Pricing" : "Auction settings"}
          </h2>

          {saleType === "FIXED_PRICE" && (
            <div>
              <label htmlFor="price" className={LABEL}>Price (USD) <span className="text-red-400">*</span></label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-stone-400">$</span>
                <input
                  id="price"
                  name="price"
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className={`${FIELD} pl-7`}
                />
              </div>
            </div>
          )}

          {saleType === "AUCTION" && (
            <>
              <div>
                <label htmlFor="startBid" className={LABEL}>Starting bid (USD) <span className="text-red-400">*</span></label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-stone-400">$</span>
                  <input
                    id="startBid"
                    name="startBid"
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    placeholder="0.00"
                    className={`${FIELD} pl-7`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reservePrice" className={LABEL}>
                  Reserve price (USD)
                  <span className="ml-1 font-normal text-stone-400">— optional, hidden from buyers</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-stone-400">$</span>
                  <input
                    id="reservePrice"
                    name="reservePrice"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    className={`${FIELD} pl-7`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="endAt" className={LABEL}>Auction end date &amp; time <span className="text-red-400">*</span></label>
                <input
                  id="endAt"
                  name="endAt"
                  type="datetime-local"
                  required
                  min={minAuctionEnd}
                  className={FIELD}
                />
              </div>
            </>
          )}
        </section>

        <div className="flex items-center justify-end gap-3">
          <a href="/seller/listings" className="text-sm text-stone-500 hover:text-stone-700 transition-colors">
            Cancel
          </a>
          <button
            type="submit"
            suppressHydrationWarning
            disabled={!canSubmit}
            title={imageUrls.length === 0 ? "Add at least one photo to continue" : undefined}
            className="rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            {pending ? "Creating…" : "Create listing"}
          </button>
        </div>
      </form>
    </div>
  );
}
