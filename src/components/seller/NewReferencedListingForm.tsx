"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import {
  createReferencedListingAction,
  resolveTeemillRefAction,
  type ReferencedPreview,
} from "@/app/actions/referenced-apparel";

const FIELD =
  "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none w-full";
const LABEL = "block text-xs font-medium text-stone-600 mb-1.5";

const LIFESTYLE_ACCEPT = ["image/jpeg", "image/png", "image/tiff", "image/webp"];
const LIFESTYLE_MAX_BYTES = 70 * 1024 * 1024;
const MAX_LIFESTYLE = 10;

// Fallback only — the page passes a project-scoped designer URL
// (https://teemill.com/create-a-product/?project={projectId}).
const DEFAULT_TEEMILL_DESIGNER = "https://teemill.com/create-a-product/";
// Indicative GBP→USD rate for a display-only margin hint. NOT a live FX call and
// never used to compute the buyer's price (US-MFTF-13.3).
const INDICATIVE_GBP_USD = 1.27;

export default function NewReferencedListingForm({
  teemillDesignerUrl = DEFAULT_TEEMILL_DESIGNER,
}: {
  teemillDesignerUrl?: string;
}) {
  const [state, action, pending] = useActionState(
    createReferencedListingAction,
    undefined as { error: string } | undefined,
  );

  const [ref, setRef] = useState("");
  const [resolving, startResolve] = useTransition();
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReferencedPreview | null>(null);

  const [retailPrice, setRetailPrice] = useState("");
  const [lifestyleUrls, setLifestyleUrls] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lifestyleUploading, startLifestyle] = useTransition();
  const lifestyleRef = useRef<HTMLInputElement>(null);

  function handleResolve() {
    setResolveError(null);
    startResolve(async () => {
      const res = await resolveTeemillRefAction(ref);
      if ("error" in res) {
        setPreview(null);
        setResolveError(res.error);
      } else {
        setPreview(res.preview);
      }
    });
  }

  function handleLifestyleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (lifestyleUrls.length >= MAX_LIFESTYLE) {
      setUploadError(`You can upload at most ${MAX_LIFESTYLE} lifestyle photos.`);
      return;
    }
    if (!LIFESTYLE_ACCEPT.includes(file.type)) {
      setUploadError("Lifestyle photos must be JPEG, PNG, TIFF, or WebP.");
      if (lifestyleRef.current) lifestyleRef.current.value = "";
      return;
    }
    if (file.size > LIFESTYLE_MAX_BYTES) {
      setUploadError("Photo exceeds the 70 MB limit.");
      if (lifestyleRef.current) lifestyleRef.current.value = "";
      return;
    }
    startLifestyle(async () => {
      try {
        const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
        const blob = await upload(`apparel/lifestyle/${crypto.randomUUID()}${ext}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
        });
        setLifestyleUrls((prev) => [...prev, blob.url]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        if (lifestyleRef.current) lifestyleRef.current.value = "";
      }
    });
  }

  const retailNum = parseFloat(retailPrice);
  const marginHint =
    preview && isFinite(retailNum) && retailNum > 0
      ? retailNum - preview.providerBasePrice * INDICATIVE_GBP_USD
      : null;

  const busy = pending || lifestyleUploading;
  const canSubmit = !busy && !!preview && isFinite(retailNum) && retailNum >= 1;

  return (
    <form action={action} className="space-y-8">
      {state && "error" in state && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Hidden submitted values */}
      <input type="hidden" name="providerProductRef" value={ref} />
      {lifestyleUrls.map((url) => (
        <input key={url} type="hidden" name="lifestyleImageUrl" value={url} />
      ))}

      {/* Step 1 — Reference a Teemill product */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-stone-800">Reference a Teemill product</h2>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p className="font-medium">Create your design on Teemill first.</p>
          <p>
            This form does <strong>not</strong> create the product — it references one that
            already exists on Teemill. Design and publish your product on Teemill, then come back
            and paste its link below.
          </p>
          <p>
            Once your design is published on Teemill, open the product and copy its link (or ref)
            from the address bar, then paste it here. Colours, sizes, and mockups come from the
            Teemill product and can&apos;t be edited here.
          </p>
          <a
            href={teemillDesignerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700"
          >
            Open the Teemill designer ↗
          </a>
        </div>

        <div>
          <label htmlFor="teemillRef" className={LABEL}>
            Teemill product link or ref <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2">
            <input
              id="teemillRef"
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="https://teemill.com/product/…  or  the product ref"
              className={FIELD}
            />
            <button
              type="button"
              onClick={handleResolve}
              disabled={resolving || !ref.trim()}
              className="shrink-0 rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {resolving ? "Resolving…" : "Resolve"}
            </button>
          </div>
          {resolveError && (
            <p className="mt-2 text-sm text-red-600">{resolveError}</p>
          )}
        </div>

        {preview && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-stone-900">{preview.title}</p>
            <div className="flex flex-wrap items-center gap-2">
              {preview.colors.map((c) => (
                <span key={c.colorName} className="flex items-center gap-1.5 text-xs text-stone-600">
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-stone-300"
                    style={{ backgroundColor: c.colorHex }}
                    aria-hidden
                  />
                  {c.colorName}
                </span>
              ))}
            </div>
            <p className="text-xs text-stone-500">Sizes: {preview.sizes.join(", ")}</p>
            {preview.mockups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {preview.mockups.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="Teemill mockup" className="h-20 w-20 rounded-lg object-cover" />
                ))}
              </div>
            )}
            <p className="text-xs text-stone-500">
              Your cost (Teemill, {preview.providerBaseCurrency}): £{preview.providerBasePrice.toFixed(2)}
            </p>
          </div>
        )}
      </section>

      {/* Step 2 — Merchandising */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-stone-800">Merchandising</h2>

        <div>
          <label htmlFor="title" className={LABEL}>
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            defaultValue={preview?.title ?? ""}
            key={preview?.title}
            placeholder="e.g. Powered By Plants"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="description" className={LABEL}>Description</label>
          <textarea
            id="description"
            name="description"
            rows={4}
            placeholder="Tell buyers about this design…"
            className={`${FIELD} resize-none`}
          />
        </div>

        <div>
          <label htmlFor="retailPrice" className={LABEL}>
            Retail price (USD) <span className="text-red-400">*</span>
          </label>
          <div className="relative max-w-40">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-stone-400">$</span>
            <input
              id="retailPrice"
              name="retailPrice"
              type="number"
              min="1"
              step="0.01"
              required
              value={retailPrice}
              onChange={(e) => setRetailPrice(e.target.value)}
              placeholder="0.00"
              className={`${FIELD} pl-7`}
            />
          </div>
          {marginHint !== null && (
            <p className="mt-1.5 text-xs text-stone-400">
              Indicative margin: ~${marginHint.toFixed(2)} (using an illustrative rate; not a live
              conversion — for your eyeballing only).
            </p>
          )}
        </div>
      </section>

      {/* Step 3 — Lifestyle photos */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-stone-800">Lifestyle photos</h2>
        <p className="text-xs text-stone-400">
          Optional — if you don&apos;t add any, the Teemill mockups are used as the listing images.
        </p>

        {lifestyleUrls.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {lifestyleUrls.map((url, i) => (
              <div key={url} className="relative h-24 w-24 overflow-hidden rounded-xl border-2 border-stone-200 bg-stone-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Lifestyle ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setLifestyleUrls((prev) => prev.filter((u) => u !== url))}
                  className="absolute right-1 top-1 rounded-full bg-black/50 px-1.5 text-[10px] text-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:border-stone-500 ${
            lifestyleUploading || lifestyleUrls.length >= MAX_LIFESTYLE ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          {lifestyleUploading ? "Uploading…" : "Add photo"}
          <input
            ref={lifestyleRef}
            type="file"
            accept={LIFESTYLE_ACCEPT.join(",")}
            className="sr-only"
            onChange={handleLifestyleChange}
            disabled={lifestyleUploading || lifestyleUrls.length >= MAX_LIFESTYLE}
          />
        </label>
      </section>

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      <div className="flex items-center justify-end gap-3">
        <a href="/seller/listings" className="text-sm text-stone-500 hover:text-stone-700">Cancel</a>
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={busy || !preview}
          className="rounded-full border border-stone-300 px-6 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Save as draft
        </button>
        <button
          type="submit"
          name="intent"
          value="publish"
          disabled={!canSubmit}
          title={!preview ? "Resolve a Teemill product to continue" : undefined}
          className="rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {pending ? "Publishing…" : "Publish"}
        </button>
      </div>
    </form>
  );
}
