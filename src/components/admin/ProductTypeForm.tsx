"use client";

import { useState } from "react";

interface Defaults {
  name?: string;
  description?: string;
  fulfillmentProvider?: string;
  providerSkuBase?: string;
  isActive?: string;
}

export default function ProductTypeForm({ defaults }: { defaults?: Defaults } = {}) {
  // Designed product types are Prodigi-only (US-MFTF-16.1). Teemill is a
  // REFERENCED source added via the referenced-listing path, so it is no longer
  // offered in this designed-mode picker.
  const [provider, setProvider] = useState(
    defaults?.fulfillmentProvider ?? "PRODIGI"
  );

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
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Fulfillment provider <span className="text-red-500">*</span>
        </label>
        <select
          name="fulfillmentProvider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
        >
          <option value="PRODIGI">Prodigi</option>
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

      {/* Prodigi SKU (designed types are Prodigi-only) */}
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
