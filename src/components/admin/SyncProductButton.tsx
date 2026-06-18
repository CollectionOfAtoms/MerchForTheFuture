"use client";

import { useState, useTransition } from "react";
import { syncProductTypeFromProdigiAction } from "@/app/actions/admin/product-catalog";

/**
 * Admin: pull THIS designed (Prodigi) product type's sizes + colours from the live
 * Prodigi catalog. Runs automatically once at creation; this button re-syncs on
 * demand from the product edit page.
 */
export default function SyncProductButton({ productTypeId }: { productTypeId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-stone-500">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncProductTypeFromProdigiAction(productTypeId);
            setMsg("error" in r ? r.error : `Synced ${r.sizes} sizes · ${r.colors} colours`);
          })
        }
        className="rounded-full border border-stone-300 px-4 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-500 transition-colors disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Sync from Prodigi"}
      </button>
    </div>
  );
}
