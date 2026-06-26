"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApparelDetail } from "@/lib/apparel/detail";
import { localizedPrice, type DisplayCurrency } from "@/lib/tax/currency";
import { addToCartAction } from "@/app/actions/cart";

/**
 * Buyer-facing apparel product view: lifestyle/mockup carousel, colour picker,
 * size selector, and a (currently stubbed) "Add to cart" button. Consumes the
 * normalized read-shape, so it renders identically for both sourcing modes and
 * never references a provider name or `sourcingMode`.
 *
 * The first offered colour is pre-selected on load in both sourcing modes
 * (US-MFTF-16.2), so the page is immediately complete and the buyer only needs
 * to choose a size; the buy button gates on size alone. A listing with zero
 * offered colours degrades gracefully (colour stays null, buy stays disabled).
 *
 * Selecting a colour jumps the carousel to that colour's mockup when one exists
 * (referenced listings carry one image per colour); lifestyle-photo listings
 * have no colour-tagged images, so the carousel stays put. Manual carousel
 * navigation never changes the selected colour or size.
 *
 * Uses plain `<img>` because referenced listings fall back to Teemill mockups
 * served from `images.podos.io`, which is not in the `next/image` allowlist.
 */
export default function ApparelProductView({ detail, display }: { detail: ApparelDetail; display?: DisplayCurrency | null }) {
  // Index of the per-colour mockup for a given colour, or -1 if none is tagged
  // (lifestyle-photo listings). Shared by the default-colour initializer and
  // selectColor so the carousel pairs with the chosen colour consistently.
  const mockupIndexForColor = (i: number) =>
    detail.images.findIndex((img) => img.colorName === detail.colors[i]?.name);

  const defaultColorIndex = detail.colors.length > 0 ? 0 : null;
  const [colorIndex, setColorIndex] = useState<number | null>(defaultColorIndex);
  const [size, setSize] = useState<string | null>(null);
  // The carousel opens on the first media item (US-MFTF-19.1): with the
  // lifestyle-then-mockups union that is the first lifestyle photo when one
  // exists, else the first mockup. The first colour is still pre-selected
  // (US-MFTF-16.2) but the initial slide no longer jumps to its mockup —
  // selecting a colour does that. For a mockups-only listing the first mockup is
  // index 0 and is the first colour's mockup, so both behaviours agree.
  const [imageIndex, setImageIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const router = useRouter();

  const { primary: price, secondary: priceSecondary } = localizedPrice(detail.retailPrice, display);

  const hasImages = detail.images.length > 0;
  const activeImage = hasImages ? detail.images[Math.min(imageIndex, detail.images.length - 1)] : null;
  const canAddToCart = colorIndex !== null && size !== null && !isPending;

  function selectColor(i: number) {
    setColorIndex(i);
    // If a per-colour mockup exists for this colour (referenced listings carry
    // one image per colour), jump the carousel to it. Lifestyle-photo listings
    // have no colour-tagged images, so the carousel stays put. Manual carousel
    // navigation never changes the selected colour/size.
    const match = mockupIndexForColor(i);
    if (match >= 0) setImageIndex(match);
  }

  function handleAddToCart() {
    if (colorIndex === null || size === null) return;
    setError(null);
    setAdded(false);
    const colorId = detail.colors[colorIndex].name;
    startTransition(async () => {
      const result = await addToCartAction({
        itemKind: "APPAREL",
        apparelListingId: detail.id,
        selection: { colorId, sizeLabel: size },
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        setAdded(true);
        // Re-render the server nav so the cart badge reflects the new count
        // without a full page reload.
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="grid gap-10 lg:grid-cols-2">
        {/* Carousel */}
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl bg-stone-100">
            {activeImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeImage.url}
                alt={`${detail.title} (${Math.min(imageIndex, detail.images.length - 1) + 1} of ${detail.images.length})`}
                className="mx-auto max-h-[70vh] w-full object-contain"
              />
            ) : (
              <div className="flex h-72 w-full items-center justify-center">
                <span className="text-sm text-stone-400">No image</span>
              </div>
            )}
          </div>

          {detail.images.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2">
              {detail.images.map((img, i) => (
                <button
                  type="button"
                  key={img.url}
                  onClick={() => setImageIndex(i)}
                  aria-label={`View image ${i + 1}`}
                  className={`overflow-hidden rounded-lg border-2 transition-colors ${
                    i === Math.min(imageIndex, detail.images.length - 1)
                      ? "border-stone-900"
                      : "border-transparent hover:border-stone-400"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={`${detail.title} thumbnail ${i + 1}`} className="h-16 w-16 object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details + selection */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">{detail.title}</h1>
            <p className="mt-2 text-2xl font-bold text-stone-900">
              {price}
              {priceSecondary && <span className="ml-2 text-sm font-normal text-stone-500">({priceSecondary})</span>}
            </p>
          </div>

          {detail.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-stone-700">{detail.description}</p>
          )}

          {/* Colour picker */}
          {detail.colors.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-stone-700">Color</p>
              <div className="flex flex-wrap gap-2">
                {detail.colors.map((color, i) => {
                  const selected = colorIndex === i;
                  return (
                    <button
                      type="button"
                      key={`${color.name}-${i}`}
                      onClick={() => selectColor(i)}
                      aria-pressed={selected}
                      aria-label={color.name}
                      title={color.name}
                      className={`h-9 w-9 overflow-hidden rounded-full border-2 transition-transform ${
                        selected ? "border-stone-900 ring-2 ring-stone-900/30" : "border-stone-200 hover:scale-105"
                      }`}
                    >
                      {color.swatchImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={color.swatchImageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span
                          className="block h-full w-full"
                          style={{ backgroundColor: color.hex ?? "#d6d3d1" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-stone-500">
                Colors shown are representative — exact shade may vary slightly by batch
              </p>
            </div>
          )}

          {/* Size selector */}
          {detail.sizes.length > 0 && (
            <div role="group" aria-label="Size">
              <p className="mb-2 text-sm font-medium text-stone-700">Size</p>
              <div className="flex flex-wrap gap-2">
                {detail.sizes.map((s) => {
                  const selected = size === s;
                  return (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setSize(s)}
                      aria-pressed={selected}
                      className={`min-w-[3rem] rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        selected
                          ? "border-stone-900 bg-stone-900 text-white"
                          : "border-stone-200 text-stone-700 hover:border-stone-400"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add to cart (US-MFTF-11.2). The first colour is defaulted on load
              (US-MFTF-16.2), so the button gates on size alone; the buyer stays
              on the page and the nav badge updates. */}
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!canAddToCart}
            aria-disabled={!canAddToCart}
            className={`w-full rounded-full py-3 text-sm font-medium transition-colors ${
              canAddToCart
                ? "bg-stone-900 text-white hover:bg-stone-700"
                : "cursor-not-allowed bg-stone-200 text-stone-400"
            }`}
          >
            {isPending ? "Adding…" : "Add to cart"}
          </button>
          {colorIndex === null ? (
            <p className="-mt-3 text-center text-xs text-stone-400">This item is currently unavailable</p>
          ) : size === null ? (
            <p className="-mt-3 text-center text-xs text-stone-400">Select a size to continue</p>
          ) : null}
          {added && (
            <p role="status" className="-mt-3 text-center text-xs font-medium text-emerald-700">
              Added to cart
            </p>
          )}
          {error && (
            <p role="alert" className="-mt-3 text-center text-xs text-rose-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
