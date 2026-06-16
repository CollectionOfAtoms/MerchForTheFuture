import { setListingStatusAction } from "@/app/actions/listings";
import { setApparelListingStatusAction } from "@/app/actions/apparel";
import {
  listingStatusStyle,
  listingStatusTransitions,
  type ListingKind,
} from "@/lib/seller/listing-status";

/**
 * Status panel for a listing's edit page: shows the current status, lets the
 * seller change it (Publish / Unlist / Archive), and — when the listing is
 * UNLISTED — explains that it's viewable by direct link but hidden from the
 * store. Works for both artwork and apparel listings; the right server action
 * is chosen from `kind`.
 */
export default function ListingStatusControls({
  kind,
  listingId,
  status,
}: {
  kind: ListingKind;
  listingId: string;
  status: string;
}) {
  const style = listingStatusStyle(status);
  const transitions = status === "SOLD" ? [] : listingStatusTransitions(status);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-stone-700">Status</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style.pill}`}>{style.label}</span>
        </div>

        {transitions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {transitions.map((t) => (
              <form
                key={t.target}
                action={async () => {
                  "use server";
                  if (kind === "ARTWORK") await setListingStatusAction(listingId, t.target);
                  else await setApparelListingStatusAction(listingId, t.target);
                }}
              >
                <button
                  type="submit"
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  {t.label}
                </button>
              </form>
            ))}
          </div>
        )}
      </div>

      {status === "UNLISTED" && (
        <p className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-700">
          This listing is <strong>unlisted</strong> — it&apos;s viewable by anyone with a direct link, but it
          won&apos;t appear in the store or any browse feeds. Publish it when you&apos;re ready to go live.
        </p>
      )}
    </section>
  );
}
