"use client";

import { useState } from "react";
import TeemillProductPicker from "./TeemillProductPicker";

interface Defaults {
  name?: string;
  description?: string;
  fulfillmentProvider?: string;
  providerSkuBase?: string;
  isActive?: string;
}

export default function ProductTypeForm({ defaults }: { defaults?: Defaults } = {}) {
  const [provider, setProvider] = useState(
    defaults?.fulfillmentProvider ?? "TEEMILL"
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
          <option value="TEEMILL">T-Mill</option>
          <option value="PRODIGI">Prodigi</option>
        </select>
      </div>

      {/* Provider-specific product selection */}
      {provider === "TEEMILL" ? (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-3">
            Product <span className="text-red-500">*</span>
          </label>
          <TeemillProductPicker defaultItemCode={defaults?.providerSkuBase} />
        </div>
      ) : (
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
