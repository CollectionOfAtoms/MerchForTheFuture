"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { createApparelListingAction } from "@/app/actions/apparel";
import { DesignFilePreview } from "@/components/seller/DesignFilePreview";
import type { ApparelProductTypeOption } from "@/lib/apparel/listings";

const FIELD =
  "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none w-full";
const LABEL = "block text-xs font-medium text-stone-600 mb-1.5";

const DESIGN_ACCEPT = ["image/png", "image/svg+xml", "image/tiff"];
const DESIGN_MAX_BYTES = 70 * 1024 * 1024;
const LIFESTYLE_ACCEPT = ["image/jpeg", "image/png", "image/tiff", "image/webp"];
const LIFESTYLE_MAX_BYTES = 70 * 1024 * 1024;
const MAX_LIFESTYLE = 10;

export default function NewApparelListingForm({
  productTypes,
}: {
  productTypes: ApparelProductTypeOption[];
}) {
  const [state, action, pending] = useActionState(
    createApparelListingAction,
    undefined as { error: string } | undefined,
  );

  const [productTypeId, setProductTypeId] = useState(productTypes[0]?.id ?? "");
  const selected = useMemo(
    () => productTypes.find((pt) => pt.id === productTypeId),
    [productTypes, productTypeId],
  );

  // Color curation — all colors start offered; the seller can deselect any.
  const [offered, setOffered] = useState<Set<string>>(new Set());
  // When the product type changes, default to all of its colors offered.
  const offeredForType = useMemo(() => {
    if (!selected) return new Set<string>();
    // If the user hasn't touched this type's colors yet, default to all on.
    const known = selected.colors.map((c) => c.id);
    const anyKnown = known.some((id) => offered.has(id) || offered.has(`off:${id}`));
    if (!anyKnown) return new Set(known);
    return new Set(known.filter((id) => !offered.has(`off:${id}`)));
  }, [selected, offered]);

  function toggleColor(id: string) {
    setOffered((prev) => {
      const next = new Set(prev);
      const isOff = next.has(`off:${id}`);
      // Track explicit "off" so the all-on default doesn't re-enable it.
      if (offeredForType.has(id) && !isOff) next.add(`off:${id}`);
      else next.delete(`off:${id}`);
      return next;
    });
  }

  const [designUrl, setDesignUrl] = useState("");
  const [designUploading, setDesignUploading] = useState(false);
  const [lifestyleUrls, setLifestyleUrls] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lifestyleUploading, startLifestyle] = useTransition();
  const designRef = useRef<HTMLInputElement>(null);
  const lifestyleRef = useRef<HTMLInputElement>(null);

  async function handleDesignChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!DESIGN_ACCEPT.includes(file.type)) {
      setUploadError("Design file must be PNG, SVG, or TIFF.");
      if (designRef.current) designRef.current.value = "";
      return;
    }
    if (file.size > DESIGN_MAX_BYTES) {
      setUploadError("Design file exceeds the 70 MB limit.");
      if (designRef.current) designRef.current.value = "";
      return;
    }
    setDesignUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const blob = await upload(`apparel/design/${crypto.randomUUID()}${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      setDesignUrl(blob.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setDesignUploading(false);
      if (designRef.current) designRef.current.value = "";
    }
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

  const busy = pending || designUploading || lifestyleUploading;
  const canSubmit = !busy && !!designUrl && offeredForType.size > 0 && !!productTypeId;

  if (productTypes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center">
        <p className="text-sm text-stone-500">
          No products are available yet. An admin needs to add a product type before you can
          create an apparel listing.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-8">
      {state && "error" in state && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Hidden submitted values */}
      <input type="hidden" name="productTypeId" value={productTypeId} />
      <input type="hidden" name="designImageUrl" value={designUrl} />
      {Array.from(offeredForType).map((id) => (
        <input key={id} type="hidden" name="offeredColorId" value={id} />
      ))}
      {lifestyleUrls.map((url) => (
        <input key={url} type="hidden" name="lifestyleImageUrl" value={url} />
      ))}

      {/* Step 1 — Product & design */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-stone-800">Product &amp; design</h2>

        <div>
          <label htmlFor="productType" className={LABEL}>
            Product type <span className="text-red-400">*</span>
          </label>
          <select
            id="productType"
            value={productTypeId}
            onChange={(e) => setProductTypeId(e.target.value)}
            className={FIELD}
          >
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="title" className={LABEL}>
            Title <span className="text-red-400">*</span>
          </label>
          <input id="title" name="title" type="text" required placeholder="e.g. Solar Punk Bee" className={FIELD} />
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
          <label className={LABEL}>
            Design file <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs text-stone-400">
            The clean artwork sent to the printer. PNG, SVG, or TIFF · max 70 MB · never shown to buyers.
          </p>
          {designUrl ? (
            <div className="flex items-center gap-4">
              <DesignFilePreview key={designUrl} url={designUrl} />
              <button
                type="button"
                onClick={() => setDesignUrl("")}
                className="text-xs text-stone-500 hover:text-stone-800"
              >
                Replace
              </button>
            </div>
          ) : (
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:border-stone-500 ${
                designUploading ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {designUploading ? "Uploading…" : "Upload design file"}
              <input
                ref={designRef}
                type="file"
                accept={DESIGN_ACCEPT.join(",")}
                className="sr-only"
                onChange={handleDesignChange}
                disabled={designUploading}
              />
            </label>
          )}
        </div>
      </section>

      {/* Step 2 — Colors */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-stone-800">
          Colors <span className="text-red-400">*</span>
        </h2>
        <p className="text-xs text-stone-400">
          All colors are offered by default — deselect any you don&apos;t want to sell.
        </p>
        <div className="flex flex-wrap gap-3">
          {selected?.colors.map((c) => {
            const isOn = offeredForType.has(c.id);
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => toggleColor(c.id)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition-colors ${
                  isOn ? "border-stone-900 bg-stone-50" : "border-transparent opacity-50 hover:opacity-100"
                }`}
              >
                <span className="h-14 w-14 overflow-hidden rounded-lg bg-stone-100">
                  {c.colorImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.colorImageUrl} alt={c.colorName} className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="text-[11px] text-stone-600">{c.colorName}</span>
              </button>
            );
          })}
        </div>
        {selected && selected.sizes.length > 0 && (
          <p className="text-xs text-stone-500">
            Sizes offered: {selected.sizes.map((s) => s.sizeLabel).join(", ")}
          </p>
        )}
      </section>

      {/* Step 3 — Photos & price */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-stone-800">Lifestyle photos &amp; price</h2>

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
        <p className="text-xs text-stone-400">Up to {MAX_LIFESTYLE} photos · a small corner watermark is added automatically.</p>

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
              placeholder="0.00"
              className={`${FIELD} pl-7`}
            />
          </div>
          <p className="mt-1.5 text-xs text-stone-400">
            Sizes are offered based on product availability — no size-specific pricing.
          </p>
        </div>
      </section>

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      <div className="flex items-center justify-end gap-3">
        <a href="/seller/listings" className="text-sm text-stone-500 hover:text-stone-700">Cancel</a>
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={busy || !productTypeId}
          className="rounded-full border border-stone-300 px-6 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Save as draft
        </button>
        <button
          type="submit"
          name="intent"
          value="publish"
          disabled={!canSubmit}
          title={!designUrl ? "Upload a design file to continue" : undefined}
          className="rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {pending ? "Publishing…" : "Publish"}
        </button>
      </div>
    </form>
  );
}
