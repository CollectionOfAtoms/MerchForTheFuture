"use client";

import { useState, useTransition } from "react";
import {
  syncProductTypeFromProdigiAction,
  syncProductTypeFromPrintifyAction,
} from "@/app/actions/admin/product-catalog";

/**
 * Admin: pull THIS designed product type's sizes + colours (+ Printify stock images)
 * from the live provider catalog. Runs automatically once at creation; this button
 * re-syncs on demand from the product edit page. Provider-aware so a Printify product
 * type re-syncs from Printify, not Prodigi (US-MFTF-17.6 fix).
 */
export default function SyncProductButton({
  productTypeId,
  provider = "PRODIGI",
}: {
  productTypeId: string;
  provider?: "PRODIGI" | "PRINTIFY";
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const providerLabel = provider === "PRINTIFY" ? "Printify" : "Prodigi";

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-stone-500">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r =
              provider === "PRINTIFY"
                ? await syncProductTypeFromPrintifyAction(productTypeId)
                : await syncProductTypeFromProdigiAction(productTypeId);
            setMsg("error" in r ? r.error : `Synced ${r.sizes} sizes · ${r.colors} colours`);
          })
        }
        className="rounded-full border border-stone-300 px-4 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-500 transition-colors disabled:opacity-50"
      >
        {pending ? "Syncing…" : `Sync from ${providerLabel}`}
      </button>
    </div>
  );
}
