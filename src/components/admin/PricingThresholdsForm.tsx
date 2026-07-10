"use client";

import { useActionState } from "react";
import { updatePricingThresholdsAction } from "@/app/actions/pricing-config";

const FIELD =
  "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-stone-400 focus:outline-none w-full";
const LABEL = "block text-xs font-medium text-stone-600 mb-1.5";

/**
 * Admin form for the US-landed-cost band thresholds (US-MFTF-19.6). Dollar inputs;
 * the action stores cents and enforces amber < red. The bands are presentation
 * only — changing thresholds re-derives every badge, nothing per-product is stored.
 */
export default function PricingThresholdsForm({
  amberAbove,
  redAbove,
}: {
  amberAbove: number;
  redAbove: number;
}) {
  const [state, formAction, pending] = useActionState(
    updatePricingThresholdsAction,
    undefined as { error: string } | { success: true } | undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state && "error" in state && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}
      {state && "success" in state && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Saved.</div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="amberAbove" className={LABEL}>Green ≤ (USD)</label>
          <input id="amberAbove" name="amberAbove" type="number" min="0" step="0.01" required defaultValue={amberAbove} className={FIELD} />
        </div>
        <div>
          <label htmlFor="redAbove" className={LABEL}>Amber ≤ (USD)</label>
          <input id="redAbove" name="redAbove" type="number" min="0" step="0.01" required defaultValue={redAbove} className={FIELD} />
        </div>
      </div>
      <p className="text-xs text-stone-400">Costs above the amber threshold show red. Amber must be below red.</p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save thresholds"}
      </button>
    </form>
  );
}
