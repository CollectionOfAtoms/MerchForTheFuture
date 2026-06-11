"use client";

import { useState, useEffect } from "react";

export interface TeemillProduct {
  item_code: string;
  name: string;
  colours: Record<string, string>; // color name → image URL
}

interface Props {
  /** Pre-select a product by item code (used on the edit page). */
  defaultItemCode?: string;
}

export default function TeemillProductPicker({ defaultItemCode }: Props) {
  const [products, setProducts] = useState<TeemillProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TeemillProduct | null>(null);
  // Per-card carousel index: { [item_code]: colorIndex }
  const [carouselIdx, setCarouselIdx] = useState<Record<string, number>>({});
  const [showGrid, setShowGrid] = useState(!defaultItemCode);

  useEffect(() => {
    fetch("/api/teemill/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const prods: TeemillProduct[] = data.data ?? [];
        setProducts(prods);
        if (defaultItemCode) {
          const found = prods.find((p) => p.item_code === defaultItemCode) ?? null;
          setSelected(found);
        }
        setLoading(false);
      })
      .catch(() => {
        setError(
          "Could not load the Teemill catalog. Check your connection and refresh to try again."
        );
        setLoading(false);
      });
  }, [defaultItemCode]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function colorEntries(p: TeemillProduct): [string, string][] {
    return Object.entries(p.colours);
  }

  function currentEntry(p: TeemillProduct): [string, string] {
    const entries = colorEntries(p);
    return entries[carouselIdx[p.item_code] ?? 0] ?? entries[0];
  }

  function step(p: TeemillProduct, dir: 1 | -1) {
    const len = colorEntries(p).length;
    setCarouselIdx((prev) => ({
      ...prev,
      [p.item_code]: ((prev[p.item_code] ?? 0) + dir + len) % len,
    }));
  }

  function pick(p: TeemillProduct) {
    setSelected(p);
    setShowGrid(false);
  }

  // ── Hidden form inputs (always rendered so the server action sees them) ────

  const hiddenInputs = selected ? (
    <>
      <input type="hidden" name="providerSkuBase" value={selected.item_code} />
      <input
        type="hidden"
        name="teemillColorsJson"
        value={JSON.stringify(
          colorEntries(selected).map(([name, imageUrl]) => ({ name, imageUrl }))
        )}
      />
    </>
  ) : null;

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-stone-400">
        Loading Teemill catalog…
      </div>
    );
  }

  if (error) {
    return (
      <>
        {hiddenInputs}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      </>
    );
  }

  // ── Selected-product summary view ──────────────────────────────────────────

  if (!showGrid && selected) {
    const entries = colorEntries(selected);
    return (
      <div>
        {hiddenInputs}
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
          <p className="text-xs font-mono text-stone-400 mb-0.5">{selected.item_code}</p>
          <p className="font-semibold text-stone-900 mb-4">{selected.name}</p>
          <div className="flex flex-wrap gap-2">
            {entries.map(([colorName, imageUrl]) => (
              <div key={colorName} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={colorName}
                  className="h-12 w-12 rounded-lg object-cover border border-stone-200"
                />
                <span className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-stone-800 px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {colorName}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-stone-400">
            {entries.length} color{entries.length !== 1 ? "s" : ""} — all available to sellers by default
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowGrid(true)}
          className="mt-3 text-sm text-stone-500 underline underline-offset-2 hover:text-stone-800 transition-colors"
        >
          Select a different product
        </button>
      </div>
    );
  }

  // ── Product grid ───────────────────────────────────────────────────────────

  return (
    <div>
      {hiddenInputs}

      {selected && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-cerulean/30 bg-cerulean/5 px-4 py-2 text-sm">
          <span className="font-medium text-stone-800">{selected.name}</span>
          <span className="font-mono text-xs text-stone-400">{selected.item_code}</span>
          <button
            type="button"
            onClick={() => setShowGrid(false)}
            className="ml-auto text-xs text-stone-400 hover:text-stone-700 transition-colors"
          >
            ✕ Close
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.map((product) => {
          const entries = colorEntries(product);
          const idx = carouselIdx[product.item_code] ?? 0;
          const [colorName, imageUrl] = currentEntry(product);
          const isSelected = selected?.item_code === product.item_code;

          return (
            <div
              key={product.item_code}
              className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md ${
                isSelected
                  ? "border-cerulean ring-2 ring-cerulean/20"
                  : "border-stone-200"
              }`}
            >
              {/* Image + carousel */}
              <div className="relative aspect-square bg-stone-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={`${product.name} — ${colorName}`}
                  className="h-full w-full object-cover"
                />

                {entries.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => step(product, -1)}
                      aria-label="Previous color"
                      className="absolute left-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-stone-700 shadow hover:bg-white transition-colors text-base leading-none"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => step(product, 1)}
                      aria-label="Next color"
                      className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-stone-700 shadow hover:bg-white transition-colors text-base leading-none"
                    >
                      ›
                    </button>
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/50 px-1 py-0.5 text-xs text-white">
                      {idx + 1}/{entries.length}
                    </span>
                  </>
                )}
              </div>

              {/* Card footer */}
              <div className="px-3 py-2.5">
                <p className="font-mono text-xs text-stone-400">{product.item_code}</p>
                <p className="text-sm font-semibold text-stone-800 leading-snug">{product.name}</p>
                <p className="mt-0.5 text-xs text-stone-400 truncate">{colorName}</p>
                <button
                  type="button"
                  onClick={() => pick(product)}
                  className={`mt-2.5 w-full rounded-lg py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-cerulean text-white"
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  {isSelected ? "Selected ✓" : "Select"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
