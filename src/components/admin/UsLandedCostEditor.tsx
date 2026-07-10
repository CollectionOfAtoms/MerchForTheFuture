"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUsLandedCostAction } from "@/app/actions/us-landed-cost";
import UsLandedCostBadge from "@/components/pricing/UsLandedCostBadge";
import type { BandThresholds } from "@/lib/pricing/band";

/**
 * Admin-only inline editor for a referenced listing's US-landed cost
 * (US-MFTF-19.5). Shows the current value + color band, plus a dollar input the
 * admin can save. Sellers see the badge read-only elsewhere; only this admin
 * surface writes (via the admin-gated setUsLandedCostAction).
 */
export default function UsLandedCostEditor({
  listingId,
  cost,
  thresholds,
}: {
  listingId: string;
  cost: number | null;
  thresholds: BandThresholds;
}) {
  const [value, setValue] = useState(cost != null ? (cost / 100).toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setUsLandedCostAction(listingId, value);
      if ("error" in res) {
        setError(res.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <UsLandedCostBadge cost={cost} thresholds={thresholds} />
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-stone-400">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          aria-label="US-landed cost (USD)"
          className="w-24 rounded-lg border border-stone-200 py-1 pl-5 pr-2 text-xs text-stone-900 focus:border-stone-400 focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {pending ? "…" : "Save"}
      </button>
      {saved && <span className="text-xs text-emerald-600">Saved</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
