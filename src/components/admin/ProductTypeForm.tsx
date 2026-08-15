"use client";

import { useState, useTransition } from "react";
import {
  resolvePrintifyUrlAction,
} from "@/app/actions/admin/product-catalog";
import type { PrintifyBlueprintPreview } from "@/lib/apparel/sync-printify";

interface Defaults {
  name?: string;
  description?: string;
  fulfillmentProvider?: string;
  providerSkuBase?: string;
  printifyBlueprintId?: string;
  printifyPrintProviderId?: string;
  isActive?: string;
}

export default function ProductTypeForm({ defaults }: { defaults?: Defaults } = {}) {
  // Designed product types are Prodigi- or Printify-backed (US-MFTF-16.1 / 17.2).
  // Teemill is a REFERENCED source added via the referenced-listing path, so it is
  // not offered in this designed-mode picker.
  const [provider, setProvider] = useState(
    defaults?.fulfillmentProvider ?? "PRODIGI"
  );

  // Printify curation-by-URL (US-MFTF-17.5): paste a catalog link → look up the
  // blueprint's stock images + the print providers offering it, then pick one. The
  // pasted URL carries only the blueprint id; the provider is chosen from the preview.
  const [printifyUrl, setPrintifyUrl] = useState("");
  const [resolving, startResolve] = useTransition();
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PrintifyBlueprintPreview | null>(null);

  function handlePrintifyLookup() {
    setResolveError(null);
    startResolve(async () => {
      const res = await resolvePrintifyUrlAction(printifyUrl);
      if ("error" in res) {
        setPreview(null);
        setResolveError(res.error);
      } else {
        setPreview(res.preview);
      }
    });
  }

  return (
    <>
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          name="name"
          required
          defaultValue={defaults?.name}
          placeholder="e.g. Unisex Tee"
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Description
        </label>
        <textarea
          name="description"
          defaultValue={defaults?.description}
          rows={2}
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
        />
      </div>

      {/* Fulfillment provider — Teemill first */}
      <div>
        <label htmlFor="fulfillmentProvider" className="block text-sm font-medium text-stone-700 mb-1">
          Fulfillment provider <span className="text-red-500">*</span>
        </label>
        <select
          id="fulfillmentProvider"
          name="fulfillmentProvider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
        >
          <option value="PRODIGI">Prodigi</option>
          <option value="PRINTIFY">Printify</option>
        </select>
      </div>

      {/* Where the Teemill option used to be: a note pointing admins to the
          referenced-listing path. Copy is founder-editable; tests assert the
          region by test id, not wording (US-MFTF-16.1). */}
      <div
        data-testid="teemill-referenced-note"
        className="rounded-xl border border-cerulean/30 bg-cerulean/5 px-5 py-4 text-sm text-stone-600"
      >
        <p className="font-semibold text-stone-800">Looking for Teemill?</p>
        <p className="mt-1">
          Teemill products meet the material standard and are added through the
          referenced-listing path — no designed product type or whitelisting
          required. Build the product on Teemill and reference it directly when
          creating the listing.
        </p>
      </div>

      {/* Prodigi SKU (Prodigi-backed designed types) */}
      {provider === "PRODIGI" && (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 px-5 py-4 text-sm">
          <p className="font-semibold text-stone-800">Finding a Prodigi SKU</p>
          <ol className="list-decimal list-inside space-y-1 text-stone-500">
            <li>
              Browse the catalog at{" "}
              <strong className="text-stone-700">prodigi.com/products</strong>
            </li>
            <li>Open a product and copy its SKU from the detail page</li>
            <li>
              Example:{" "}
              <code className="rounded bg-stone-200 px-1 text-xs">
                GLOBAL-FAP-16X20
              </code>
            </li>
          </ol>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Provider SKU base <span className="text-red-500">*</span>
            </label>
            <input
              name="providerSkuBase"
              required
              defaultValue={defaults?.providerSkuBase}
              placeholder="e.g. GLOBAL-FAP-16X20"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
            />
          </div>
        </div>
      )}

      {/* Printify curation by URL (US-MFTF-17.5). Paste a printify.com catalog link;
          we look up the blueprint's stock images + the print providers offering it
          (a blueprint has many, each with its own variants/pricing), then pin the
          (blueprint, print provider) PAIR. Sizes/colours/variants sync from it on save. */}
      {provider === "PRINTIFY" && (
        <div
          data-testid="printify-catalog-fields"
          className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 px-5 py-4 text-sm"
        >
          <p className="font-semibold text-stone-800">Curated Printify style</p>
          <p className="text-stone-500">
            Paste the product&apos;s Printify catalog link (from{" "}
            <strong className="text-stone-700">printify.com/app/products/…</strong>).
            Confirm the material standard on Printify before curating — the API can&apos;t
            verify fabric composition.
          </p>

          <div>
            <label htmlFor="printifyUrl" className="block text-xs font-medium text-stone-600 mb-1">
              Printify product URL <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="printifyUrl"
                type="text"
                value={printifyUrl}
                onChange={(e) => setPrintifyUrl(e.target.value)}
                placeholder="https://printify.com/app/products/1580/…"
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
              <button
                type="button"
                onClick={handlePrintifyLookup}
                disabled={resolving || !printifyUrl.trim()}
                className="shrink-0 rounded-full border border-stone-300 px-5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {resolving ? "Looking up…" : "Look up"}
              </button>
            </div>
            {resolveError && <p className="mt-2 text-sm text-red-600">{resolveError}</p>}
          </div>

          {preview && (
            <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-sm font-semibold text-stone-900">
                {preview.title}
                {preview.brand ? <span className="ml-2 font-normal text-stone-400">{preview.brand}{preview.model ? ` · ${preview.model}` : ""}</span> : null}
              </p>

              {/* Stock images / mockups from the Printify catalog. */}
              {preview.images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {preview.images.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      src={src}
                      alt={`${preview.title} stock image`}
                      className="h-20 w-20 rounded-lg border border-stone-200 object-cover"
                    />
                  ))}
                </div>
              )}

              {/* Provider picker — the blueprint id comes from the URL; the admin
                  chooses which print provider fulfils it. Both submit to the create
                  action (blueprint id hidden, provider id from the select). */}
              <input type="hidden" name="printifyBlueprintId" value={preview.blueprintId} />
              <div>
                <label htmlFor="printifyPrintProviderId" className="block text-xs font-medium text-stone-600 mb-1">
                  Print provider <span className="text-red-500">*</span>
                </label>
                <select
                  id="printifyPrintProviderId"
                  name="printifyPrintProviderId"
                  defaultValue={preview.providers[0]?.id}
                  key={preview.blueprintId}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                >
                  {preview.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.location ? ` — ${p.location}` : ""} (id {p.id})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-stone-400">
                  Blueprint {preview.blueprintId}. Locations show where each engine ships
                  from; Printify Choice (Printify&apos;s auto-router) is listed first when
                  available. Colours, sizes and orderable variants sync from this
                  blueprint + provider on save.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          name="isActive"
          id="isActive"
          value="true"
          defaultChecked={defaults?.isActive !== "false"}
          className="h-4 w-4 rounded border-stone-300"
        />
        <label htmlFor="isActive" className="text-sm font-medium text-stone-700">
          Active
        </label>
        <input type="hidden" name="isActive" value="false" />
      </div>
    </>
  );
}
