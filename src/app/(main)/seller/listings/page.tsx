import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { setListingStatusAction } from "@/app/actions/listings";
import { setApparelListingStatusAction } from "@/app/actions/apparel";
import { getSellerListings, type SellerListingRow } from "@/lib/seller/listings";
import {
  listingStatusStyle,
  listingStatusTransitions,
  isPubliclyViewable,
  publicListingHref,
} from "@/lib/seller/listing-status";
import { DeleteListingButton } from "@/components/DeleteListingButton";
import { DeleteApparelListingButton } from "@/components/DeleteApparelListingButton";

const SALE_TYPE_LABEL: Record<string, string> = {
  FIXED_PRICE: "Fixed price",
  AUCTION: "Auction",
};

// Type badge per listing kind — distinct colour so apparel reads apart from
// artwork at a glance, not just by label (US-MFTF-6.3 badge refinement).
const KIND_BADGE: Record<SellerListingRow["kind"], { label: string; className: string }> = {
  ARTWORK: { label: "Art", className: "bg-stone-100 text-stone-500" },
  APPAREL: { label: "Apparel", className: "bg-cerulean/10 text-cerulean" },
};

export default async function SellerListingsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("SELLER")) redirect("/");

  const listings = await getSellerListings(user.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">My Listings</h1>
          <p className="mt-1 text-sm text-stone-500">
            {listings.length === 0 ? "No listings yet." : `${listings.length} listing${listings.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          <Link
            href="/seller/listings/new"
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
          >
            + New listing
          </Link>
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-24 text-center">
          <p className="text-stone-400 text-sm mb-4">You haven&apos;t listed anything yet.</p>
          <Link
            href="/seller/listings/new"
            className="inline-block rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
          >
            Create your first listing
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          {listings.map((row) => (
            <ListingRow key={`${row.kind}-${row.id}`} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function ListingRow({ row }: { row: SellerListingRow }) {
  const statusCfg = listingStatusStyle(row.status);
  const editHref = row.kind === "ARTWORK" ? `/seller/listings/${row.id}/edit` : `/seller/apparel/${row.id}/edit`;
  // The thumbnail links to the public product page when it's viewable; for an
  // apparel listing that 404s publicly (ARCHIVED/SOLD) it falls back to the edit
  // page so the click is never a dead link.
  const thumbHref = isPubliclyViewable(row.kind, row.status)
    ? publicListingHref(row.kind, { listingId: row.id, artworkId: row.kind === "ARTWORK" ? row.artworkId : undefined })
    : editHref;

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
      {/* Row 1 on mobile: thumbnail + title/meta */}
      <div className="flex items-center gap-3 min-w-0">
        <Link href={thumbHref} className="h-14 w-14 shrink-0 rounded-xl overflow-hidden bg-stone-100 hover:opacity-80 transition-opacity">
          {row.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.thumbnailUrl} alt={row.title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-stone-300 text-xs">No image</div>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${KIND_BADGE[row.kind].className}`}>
              {KIND_BADGE[row.kind].label}
            </span>
            <p className="text-sm font-medium text-stone-900 truncate">{row.title}</p>
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {row.kind === "ARTWORK" ? (
              <>
                <span className="text-xs text-stone-400">{SALE_TYPE_LABEL[row.saleType] ?? row.saleType}</span>
                {row.price != null && (
                  <span className="text-xs text-stone-400">
                    · {row.saleType === "AUCTION" ? "Start " : ""}${row.price.toLocaleString()}
                  </span>
                )}
                {row.auctionEndAt && (
                  <span className="text-xs text-stone-400">· Ends {new Date(row.auctionEndAt).toLocaleDateString()}</span>
                )}
              </>
            ) : (
              <>
                <span className="text-xs text-stone-400">{row.productTypeName}</span>
                <span className="text-xs text-stone-400">· ${row.retailPrice.toLocaleString()}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 2 on mobile: status badge + actions */}
      <div className="flex items-center gap-2 sm:contents">
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.pill}`}>
          {statusCfg.label}
        </span>

        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          <Link
            href={editHref}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          >
            Edit
          </Link>

          {(row.status === "SOLD" ? [] : listingStatusTransitions(row.status)).map((t) => (
            <form
              key={t.target}
              action={async () => {
                "use server";
                if (row.kind === "ARTWORK") await setListingStatusAction(row.id, t.target);
                else await setApparelListingStatusAction(row.id, t.target);
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-50 transition-colors"
              >
                {t.label}
              </button>
            </form>
          ))}

          {row.kind === "ARTWORK" ? (
            <DeleteListingButton listingId={row.id} isSold={row.status === "SOLD"} hasBids={row.hasBids} />
          ) : (
            <DeleteApparelListingButton listingId={row.id} isSold={row.status === "SOLD"} />
          )}
        </div>
      </div>
    </div>
  );
}
