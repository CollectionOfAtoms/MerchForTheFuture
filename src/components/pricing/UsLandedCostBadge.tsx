import { priceBand, type BandThresholds } from "@/lib/pricing/band";

// Presentational US-landed-cost badge (US-MFTF-19.6): the recorded dollar amount
// plus a display-only color band, or a neutral "not recorded" state for null. Pure
// (no server imports) so both the admin catalog view and the seller surface render
// the same single-source-of-truth value. The band is recomputed here, never stored.

const BAND_CLASS: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  none: "bg-stone-50 text-stone-400 border-stone-200",
};

export default function UsLandedCostBadge({
  cost,
  thresholds,
}: {
  cost: number | null;
  thresholds: BandThresholds;
}) {
  const band = priceBand(cost, thresholds);
  const key = band ?? "none";
  return (
    <span
      data-testid="cost-badge"
      data-band={key}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${BAND_CLASS[key]}`}
    >
      {cost != null ? (
        <>
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${band === "green" ? "bg-emerald-500" : band === "amber" ? "bg-amber-400" : "bg-red-500"}`} />
          ${(cost / 100).toFixed(2)}
        </>
      ) : (
        "Not recorded"
      )}
    </span>
  );
}
