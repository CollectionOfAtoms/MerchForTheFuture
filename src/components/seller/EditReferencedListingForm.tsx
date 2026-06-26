"use client";

import { useActionState, useState, useTransition } from "react";
import {
  updateReferencedListingAction,
  resyncReferencedListingAction,
} from "@/app/actions/referenced-apparel";
import ReferencedImageCarousel from "@/components/seller/ReferencedImageCarousel";
import type { ReferencedCarouselImage } from "@/lib/apparel/referenced";
import UsLandedCostBadge from "@/components/pricing/UsLandedCostBadge";
import type { BandThresholds } from "@/lib/pricing/band";

const FIELD =
  "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none w-full";
const LABEL = "block text-xs font-medium text-stone-600 mb-1.5";

export interface ReferencedListingForForm {
  id: string;
  title: string;
  description: string | null;
  retailPrice: number;
  status: string;
  sourcingMode: "REFERENCED";
  providerKey: string | null;
  providerProductRef: string | null;
  providerBaseCurrency: string | null;
  providerBasePrice: number | null;
  /** Founder-recorded US-landed cost in USD cents (US-MFTF-19.5); null = not recorded. */
  usLandedCost: number | null;
  snapshotFetchedAt: string | Date | null;
  colors: { colorName: string; colorHex: string }[];
  sizes: string[];
  images: { id: string; originalUrl: string }[];
  carouselImages: ReferencedCarouselImage[];
  editOnTeemillUrl: string;
}

export default function EditReferencedListingForm({
  listing,
  costThresholds,
}: {
  listing: ReferencedListingForForm;
  costThresholds: BandThresholds;
}) {
  const action = updateReferencedListingAction.bind(null, listing.id);
  const [state, formAction, pending] = useActionState(
    action,
    undefined as { error: string } | { success: true } | undefined,
  );

  const [resyncing, startResync] = useTransition();
  const [resyncChanges, setResyncChanges] = useState<string[] | null>(null);
  const [resyncError, setResyncError] = useState<string | null>(null);

  function handleResync() {
    setResyncError(null);
    setResyncChanges(null);
    startResync(async () => {
      const res = await resyncReferencedListingAction(listing.id);
      if ("error" in res) setResyncError(res.error);
      else setResyncChanges(res.changes);
    });
  }

  return (
    <div className="space-y-8">
      {/* Central preview — lifestyle photos first, then Teemill mockups. */}
      <div className="mx-auto max-w-md">
        <ReferencedImageCarousel images={listing.carouselImages} title={listing.title} />
      </div>

      {/* Provider banner — Teemill is named openly in referenced mode. */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-stone-800">From Teemill</h2>
            <p className="mt-1 text-xs text-stone-500">
              Colours, sizes, mockups, and the design are owned by the Teemill product and can&apos;t
              be edited here. Change them on Teemill, then re-sync to pull the updates in.
            </p>
          </div>
          <a
            href={listing.editOnTeemillUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full border border-stone-300 px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            Edit on Teemill ↗
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {listing.colors.map((c) => (
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
        <p className="text-xs text-stone-500">Sizes: {listing.sizes.join(", ")}</p>
        {listing.providerBasePrice != null && (
          <p className="text-xs text-stone-500">
            Your cost (Teemill, {listing.providerBaseCurrency}): £{listing.providerBasePrice.toFixed(2)}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleResync}
            disabled={resyncing}
            className="rounded-full bg-stone-900 px-5 py-2 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {resyncing ? "Re-syncing…" : "Re-sync from Teemill"}
          </button>
          <span className="text-xs text-stone-400">
            After editing on Teemill, re-sync to refresh stock, mockups, and base price.
          </span>
        </div>

        {resyncError && <p className="text-sm text-red-600">{resyncError}</p>}
        {resyncChanges && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
            {resyncChanges.length === 0 ? (
              <p>No changes — your listing already matches Teemill.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-4">
                {resyncChanges.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Editable merchandising */}
      <form action={formAction} className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-stone-800">Merchandising</h2>

        {state && "error" in state && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}
        {state && "success" in state && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Saved.
          </div>
        )}

        <div>
          <label htmlFor="title" className={LABEL}>
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            defaultValue={listing.title}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="description" className={LABEL}>Description</label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={listing.description ?? ""}
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
              defaultValue={listing.retailPrice}
              className={`${FIELD} pl-7`}
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <label htmlFor="usLandedCost" className="text-xs font-medium text-stone-600">
              US-landed cost (USD)
            </label>
            {/* Saved value + its color band at a glance (US-MFTF-19.6). */}
            <UsLandedCostBadge cost={listing.usLandedCost} thresholds={costThresholds} />
          </div>
          <div className="relative max-w-40">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-stone-400">$</span>
            <input
              id="usLandedCost"
              name="usLandedCost"
              type="number"
              min="0"
              step="0.01"
              defaultValue={listing.usLandedCost != null ? (listing.usLandedCost / 100).toFixed(2) : ""}
              className={`${FIELD} pl-7`}
            />
          </div>
          {/* Curation note only — never affects the buyer's price (US-MFTF-19.5). */}
          <p className="mt-1.5 text-xs text-stone-400">
            What it costs to land this garment to a US buyer. For your reference when curating —
            it never changes the retail price. Leave blank if not yet known.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <a href="/seller/listings" className="text-sm text-stone-500 hover:text-stone-700">Back</a>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
