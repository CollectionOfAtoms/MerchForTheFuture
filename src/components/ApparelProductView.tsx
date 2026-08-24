"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApparelDetail } from "@/lib/apparel/detail";
import { localizedPrice, type DisplayCurrency } from "@/lib/tax/currency";
import { addToCartAction } from "@/app/actions/cart";
import Carousel from "@/components/Carousel";

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
export default function ApparelProductView({
  detail,
  display,
}: {
  detail: ApparelDetail;
  display?: DisplayCurrency | null;
}) {
  // Index of the per-colour mockup for a given colour, or -1 if none is tagged
  // (lifestyle-photo listings). Shared by the default-colour initializer and
  // selectColor so the carousel pairs with the chosen colour consistently.
  const mockupIndexForColor = (i: number) =>
    detail.images.findIndex((img) => img.colorName === detail.colors[i]?.name);

  // Live out-of-stock combos (US-MFTF-17.4): greyed out and unselectable. Empty for
  // non-Printify listings, so behaviour there is unchanged.
  const unavailableSet = new Set(
    (detail.unavailable ?? []).map((u) => `${u.color}|${u.size}`),
  );
  const isComboUnavailable = (colorName: string, size: string) =>
    unavailableSet.has(`${colorName}|${size}`);
  const isColorSoldOut = (colorName: string) =>
    detail.sizes.length > 0 && detail.sizes.every((s) => isComboUnavailable(colorName, s));

  // Pre-select the first colour that still has stock (US-MFTF-16.2, refined for 17.4):
  // never default to a fully-out-of-stock colour.
  const firstAvailableColorIndex = detail.colors.findIndex((c) => !isColorSoldOut(c.name));
  const defaultColorIndex =
    firstAvailableColorIndex >= 0 ? firstAvailableColorIndex : detail.colors.length > 0 ? 0 : null;
  const [colorIndex, setColorIndex] = useState<number | null>(
    defaultColorIndex,
  );
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

  // The add-to-cart button targets a 200px width, but never narrower than its
  // measured label plus breathing room (re-measured when the label changes), so
  // a longer label can still push past the target rather than overflow.
  const buttonTextRef = useRef<HTMLSpanElement>(null);
  const [buttonWidth, setButtonWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = buttonTextRef.current;
    if (el) setButtonWidth(Math.max(200, Math.ceil(el.offsetWidth) + 24));
  }, [isPending]);

  const { primary: price, secondary: priceSecondary } = localizedPrice(
    detail.retailPrice,
    display,
  );

  const selectedColorName =
    colorIndex !== null ? detail.colors[colorIndex]?.name ?? null : null;
  const canAddToCart =
    colorIndex !== null &&
    size !== null &&
    !isPending &&
    !(selectedColorName !== null && isComboUnavailable(selectedColorName, size));

  function selectColor(i: number) {
    const name = detail.colors[i]?.name;
    // A fully out-of-stock colour is not selectable (US-MFTF-17.4).
    if (name && isColorSoldOut(name)) return;
    setColorIndex(i);
    // If the currently-chosen size is out of stock in the new colour, clear it so
    // the buyer can't hold an unavailable combo.
    if (name && size !== null && isComboUnavailable(name, size)) setSize(null);
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
      {/* Two-column product layout. Left: the carousel. Right: a full-height flex
          column where the title + description float to the top and the colour/size
          pickers + add-to-cart float to the bottom (`lg:items-stretch` gives the
          right column the carousel's height so the top block can grow to fill it).
          On mobile the whole right column simply stacks under the carousel, which
          keeps the description paired with the colour/size options. */}
      <div className="grid gap-10 lg:grid-cols-2 lg:items-stretch">
        {/* Left column — carousel (src/components/Carousel.tsx). Controlled so
            selecting a colour can jump to that colour's mockup; manual carousel
            navigation just updates imageIndex and never changes colour/size. */}
        <Carousel
          title={detail.title}
          images={detail.images.map((img) => ({
            url: img.url,
            backgroundColor: img.backgroundColor,
          }))}
          index={imageIndex}
          onIndexChange={setImageIndex}
        />

        {/* Right column */}
        <div className="flex flex-col gap-8">
          {/* Top block — title (Zen Dots) + price + description, floated to the
              top. On large screens it grows to fill the space above the controls;
              a long description scrolls within it rather than stretching the row. */}
          <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
            <div>
              <h1 className="font-display text-2xl font-semibold text-blue-slate">
                {detail.title}
              </h1>
              <p className="mt-2 text-2xl font-bold text-cerulean">
                {price}
                {priceSecondary && (
                  <span className="ml-2 text-sm font-normal text-dark-cyan">
                    ({priceSecondary})
                  </span>
                )}
              </p>
            </div>
            {detail.description && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {detail.description}
              </p>
            )}
          </div>

          {/* Bottom block — colour (left-justified) + size (right-justified) +
              add-to-cart, floated to the bottom of the column. */}
          <div className="flex flex-col gap-6">
        {/* Colour picker — left-justified within the column. */}
        {detail.colors.length > 0 && (
          <div className="text-left">
            <p className="mb-2 text-sm font-medium text-blue-slate">Color</p>
            <div className="flex flex-wrap justify-start gap-2">
              {detail.colors.map((color, i) => {
                const selected = colorIndex === i;
                const soldOut = isColorSoldOut(color.name);
                return (
                  <button
                    type="button"
                    key={`${color.name}-${i}`}
                    onClick={() => selectColor(i)}
                    disabled={soldOut}
                    aria-pressed={selected}
                    aria-label={color.name}
                    title={soldOut ? `${color.name} — out of stock` : color.name}
                    className={`h-9 w-9 overflow-hidden rounded-full border-2 transition-transform ${
                      soldOut
                        ? "cursor-not-allowed border-stone-200 opacity-40 grayscale"
                        : selected
                        ? "border-stone-900 ring-2 ring-stone-900/30"
                        : "border-stone-200 hover:scale-105"
                    }`}
                  >
                    {color.swatchImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={color.swatchImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
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
            <p className="mt-2 text-xs text-dark-cyan">
              Colors shown are representative — exact shade may vary slightly by
              batch
            </p>
          </div>
        )}

        {/* Size selector — right-justified within the column. */}
        {detail.sizes.length > 0 && (
          <div role="group" aria-label="Size" className="text-right">
            <p className="mb-2 text-sm font-medium text-blue-slate">Size</p>
            <div className="flex flex-wrap justify-end gap-2">
              {detail.sizes.map((s) => {
                const selected = size === s;
                // Out of stock for the currently-selected colour (US-MFTF-17.4).
                const soldOut =
                  selectedColorName !== null && isComboUnavailable(selectedColorName, s);
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setSize(s)}
                    disabled={soldOut}
                    aria-pressed={selected}
                    title={soldOut ? `Size ${s} — out of stock` : undefined}
                    className={`min-w-[3rem] rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      soldOut
                        ? "cursor-not-allowed border-stone-200 text-stone-300 line-through"
                        : selected
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
                on the page and the nav badge updates. Centred at ~200px wide
                (label measured so longer text can't overflow the button). */}
            <div>
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!canAddToCart}
                aria-disabled={!canAddToCart}
                style={{ width: buttonWidth ?? undefined }}
                className={`mx-auto block rounded-full py-3 text-sm font-medium transition-colors ${
                  canAddToCart
                    ? "bg-stone-900 text-white hover:bg-stone-700"
                    : "cursor-not-allowed bg-stone-200 text-stone-400"
                }`}
              >
                <span ref={buttonTextRef} className="inline-block whitespace-nowrap">
                  {isPending ? "Adding…" : "Add to cart"}
                </span>
              </button>
              {colorIndex === null ? (
                <p className="mt-3 text-center text-xs text-stone-400">
                  This item is currently unavailable
                </p>
              ) : size === null ? (
                <p className="mt-3 text-center text-xs text-stone-400">
                  Select a size to continue
                </p>
              ) : null}
              {added && (
                <p
                  role="status"
                  className="mt-3 text-center text-xs font-medium text-emerald-700"
                >
                  Added to cart
                </p>
              )}
              {error && (
                <p role="alert" className="mt-3 text-center text-xs text-rose-600">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
