"use client";

import { useState, useTransition } from "react";
import { syncDesignedFromProdigiAction } from "@/app/actions/admin/product-catalog";

/**
 * Admin one-click: sync all designed (Prodigi) product types' sizes AND colours
 * from the live Prodigi catalog. Enumerates our own designed blanks server-side
 * (no SKU list).
 */
export default function SyncSizesButton() {
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
            const r = await syncDesignedFromProdigiAction();
            setMsg("error" in r ? r.error : `Synced ${r.synced}/${r.total} designed types`);
          })
        }
        className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-500 transition-colors disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Sync from Prodigi"}
      </button>
    </div>
  );
}
