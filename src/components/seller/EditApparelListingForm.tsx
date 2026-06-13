"use client";

import { useActionState, useState } from "react";
import { updateApparelListingAction } from "@/app/actions/apparel";
import type { ApparelListingEditData } from "@/lib/apparel/listings";

const FIELD =
  "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none w-full";
const LABEL = "block text-xs font-medium text-stone-600 mb-1.5";

export default function EditApparelListingForm({ listing }: { listing: ApparelListingEditData }) {
  const action = updateApparelListingAction.bind(null, listing.id);
  const [state, formAction, pending] = useActionState(
    action,
    undefined as { error: string } | { success: true } | undefined,
  );

  const [offered, setOffered] = useState<Set<string>>(
    () => new Set(listing.colors.filter((c) => c.isOffered).map((c) => c.productTypeColorId)),
  );

  function toggleColor(id: string) {
    setOffered((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-8">
      {state && "error" in state && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state && "success" in state && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Changes saved.
        </div>
      )}

      {Array.from(offered).map((id) => (
        <input key={id} type="hidden" name="offeredColorId" value={id} />
      ))}

      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
        <div>
          <p className={LABEL}>Product type</p>
          <p className="text-sm text-stone-800">{listing.productType.name}</p>
          <p className="mt-1 text-xs text-stone-400">Product type can&apos;t be changed after creation.</p>
        </div>

        <div>
          <label htmlFor="title" className={LABEL}>Title <span className="text-red-400">*</span></label>
          <input id="title" name="title" type="text" required defaultValue={listing.title} className={FIELD} />
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
          <label htmlFor="retailPrice" className={LABEL}>Retail price (USD) <span className="text-red-400">*</span></label>
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
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-stone-800">Offered colors <span className="text-red-400">*</span></h2>
        <p className="text-xs text-stone-400">At least one color must remain offered.</p>
        <div className="flex flex-wrap gap-3">
          {listing.colors.map((c) => {
            const isOn = offered.has(c.productTypeColorId);
            return (
              <button
                type="button"
                key={c.productTypeColorId}
                onClick={() => toggleColor(c.productTypeColorId)}
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
        {listing.productType.sizes.length > 0 && (
          <p className="text-xs text-stone-500">
            Sizes offered: {listing.productType.sizes.map((s) => s.sizeLabel).join(", ")}
          </p>
        )}
      </section>

      <div className="flex items-center justify-end gap-3">
        <a href="/seller/listings" className="text-sm text-stone-500 hover:text-stone-700">Back to listings</a>
        <button
          type="submit"
          disabled={pending || offered.size === 0}
          className="rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
