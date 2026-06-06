"use client";

import { useState, useMemo, useTransition, useRef } from "react";
import { upload } from "@vercel/blob/client";
import { updatePrintConfigAction } from "@/app/actions/listings";
import { filterByAspectRatio } from "@/lib/print/listing";

interface CatalogProduct {
  sku: string;
  description: string;
  productDimensions: { width: number; height: number; units: string };
}

interface SavedProduct {
  sku: string;
  size: string;
  price: number;
  mockupUrl?: string | null;
}

interface SkuState {
  price: number;
  mockupUrl: string | null;
}

const FIELD = "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none w-full";
const LABEL = "block text-xs font-medium text-stone-600 mb-1.5";

interface PrintConfigFormProps {
  listingId: string;
  initialEnabled: boolean;
  initialSourceUrl: string | null;
  primaryArtworkUrl: string | null;
  initialProducts: SavedProduct[] | null;
  catalog: CatalogProduct[];
  artworkDimensions: { widthIn: number; heightIn: number } | null;
  printCosts: Record<string, number>;
}

function formatSize(p: CatalogProduct) {
  const { width, height, units } = p.productDimensions;
  return `${width}×${height} ${units}`;
}

export default function PrintConfigForm({
  listingId,
  initialEnabled,
  initialSourceUrl,
  primaryArtworkUrl,
  initialProducts,
  catalog,
  artworkDimensions,
  printCosts,
}: PrintConfigFormProps) {
  const savedMap = new Map(initialProducts?.map((p) => [p.sku, p]) ?? []);
  const savedSkus = new Set(savedMap.keys());

  const [enabled, setEnabled] = useState(initialEnabled);
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl ?? primaryArtworkUrl ?? "");
  const [selected, setSelected] = useState<Map<string, SkuState>>(
    () => new Map(initialProducts?.map((p) => [p.sku, { price: p.price, mockupUrl: p.mockupUrl ?? null }]) ?? [])
  );
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [uploadingSku, setUploadingSku] = useState<string | null>(null);
  const mockupFileRef = useRef<HTMLInputElement>(null);

  const displayCatalog = useMemo(
    () => filterByAspectRatio(catalog, artworkDimensions, savedSkus),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, artworkDimensions],
  );

  const isFiltered = artworkDimensions !== null && displayCatalog.length < catalog.length;

  function toggleProduct(sku: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(sku)) {
        next.delete(sku);
      } else {
        const saved = savedMap.get(sku);
        next.set(sku, { price: saved?.price ?? 0, mockupUrl: saved?.mockupUrl ?? null });
      }
      return next;
    });
  }

  function setPrice(sku: string, price: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      const current = next.get(sku) ?? { price: 0, mockupUrl: null };
      next.set(sku, { ...current, price });
      return next;
    });
  }

  function setMockupUrl(sku: string, url: string | null) {
    setSelected((prev) => {
      const next = new Map(prev);
      const current = next.get(sku) ?? { price: 0, mockupUrl: null };
      next.set(sku, { ...current, mockupUrl: url });
      return next;
    });
  }

  function triggerMockupUpload(sku: string) {
    setUploadingSku(sku);
    mockupFileRef.current?.click();
  }

  async function handleMockupFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingSku) return;
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const blob = await upload(`mockups/${listingId}/${uploadingSku}${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      setMockupUrl(uploadingSku, blob.url);
    } catch {
      setMessage({ type: "error", text: "Mockup upload failed. Please try again." });
    } finally {
      setUploadingSku(null);
      if (mockupFileRef.current) mockupFileRef.current.value = "";
    }
  }

  function handleSave() {
    setMessage(null);
    const fd = new FormData();
    fd.set("availableForPrint", enabled ? "true" : "false");
    if (enabled) {
      fd.set("printSourceImageUrl", sourceUrl);
      const products: SavedProduct[] = [];
      for (const item of catalog) {
        if (selected.has(item.sku)) {
          const { price, mockupUrl } = selected.get(item.sku)!;
          products.push({ sku: item.sku, size: formatSize(item), price, mockupUrl: mockupUrl ?? null });
        }
      }
      fd.set("printProducts", JSON.stringify(products));
    }
    startTransition(async () => {
      const result = await updatePrintConfigAction(listingId, fd);
      if (result && "error" in result) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: "Print settings saved." });
      }
    });
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
      {/* Hidden file input for mockup uploads */}
      <input
        ref={mockupFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleMockupFile}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-800">Fine art prints</h2>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-stone-500">Available for print</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
              enabled ? "bg-stone-900" : "bg-stone-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
      </div>

      {enabled && (
        <>
          <div>
            <label className={LABEL}>
              High-resolution source image URL <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://cdn.example.com/artwork-hires.jpg"
              className={FIELD}
            />
            <p className="mt-1 text-xs text-stone-400">
              {primaryArtworkUrl && initialSourceUrl == null
                ? "Defaulting to your uploaded artwork file. Change only if you have a separate high-res source for printing."
                : "Use the Vercel Blob URL of your uploaded high-res file. Aim for at least 300 DPI at the largest size you offer."}
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <p className={LABEL} style={{ marginBottom: 0 }}>
                Available sizes &amp; prices <span className="text-red-400">*</span>
              </p>
              {isFiltered && (
                <span className="text-xs text-stone-400">
                  Showing sizes that match your artwork&apos;s proportions
                </span>
              )}
            </div>
            {catalog.length === 0 ? (
              <p className="text-sm text-stone-400">Could not load print catalog. Try refreshing the page.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {displayCatalog.map((item) => {
                  const isChecked = selected.has(item.sku);
                  const skuState = selected.get(item.sku);
                  const isUploadingThis = uploadingSku === item.sku;

                  return (
                    <div key={item.sku} className={`rounded-xl border p-3 transition-colors ${isChecked ? "border-stone-300 bg-stone-50" : "border-transparent"}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`sku-${item.sku}`}
                          checked={isChecked}
                          onChange={() => toggleProduct(item.sku)}
                          className="h-4 w-4 shrink-0 rounded border-stone-300"
                        />
                        <label
                          htmlFor={`sku-${item.sku}`}
                          className="flex-1 text-sm text-stone-700 cursor-pointer"
                        >
                          <span className="font-medium">{formatSize(item)}</span>
                          <span className="ml-2 text-xs text-stone-400">{item.description}</span>
                          {printCosts[item.sku] != null && (
                            <span className="ml-2 text-xs text-stone-500">
                              — ~${Math.round(printCosts[item.sku])} to print
                            </span>
                          )}
                        </label>
                        {isChecked && (
                          <div className="relative shrink-0">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-stone-400">$</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={skuState?.price ?? ""}
                              onChange={(e) => setPrice(item.sku, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="w-20 rounded-lg border border-stone-200 pl-6 pr-2 py-1 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                            />
                          </div>
                        )}
                      </div>

                      {/* Mockup upload — shown when SKU is selected */}
                      {isChecked && (
                        <div className="mt-2.5 ml-7 flex items-center gap-3">
                          {skuState?.mockupUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={skuState.mockupUrl}
                                alt="Mockup preview"
                                className="h-14 w-20 rounded-lg object-cover border border-stone-200"
                              />
                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  onClick={() => triggerMockupUpload(item.sku)}
                                  disabled={isUploadingThis}
                                  className="text-xs text-stone-500 hover:text-stone-900 transition-colors"
                                >
                                  {isUploadingThis ? "Uploading…" : "Replace mockup"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMockupUrl(item.sku, null)}
                                  className="text-xs text-rose-500 hover:text-rose-700 transition-colors"
                                >
                                  Remove
                                </button>
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => triggerMockupUpload(item.sku)}
                              disabled={isUploadingThis}
                              className="text-xs text-stone-500 hover:text-stone-900 border border-dashed border-stone-300 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                            >
                              {isUploadingThis ? "Uploading…" : "+ Add mockup image"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-rose-600" : "text-emerald-700"}`}>
          {message.text}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save print settings"}
        </button>
      </div>
    </section>
  );
}
