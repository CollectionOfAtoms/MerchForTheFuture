import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toggleListingStatusAction } from "@/app/actions/listings";
import { DeleteListingButton } from "@/components/DeleteListingButton";

const STATUS_STYLES: Record<string, { pill: string; label: string }> = {
  ACTIVE:          { pill: "bg-emerald-100 text-emerald-700", label: "Active" },
  ARCHIVED:        { pill: "bg-stone-100 text-stone-500",     label: "Archived" },
  SOLD:            { pill: "bg-sky-100 text-sky-700",         label: "Sold" },
  RESERVE_NOT_MET: { pill: "bg-amber-100 text-amber-700",    label: "Reserve not met" },
  CANCELLED:       { pill: "bg-red-100 text-red-600",         label: "Cancelled" },
};

const SALE_TYPE_LABEL: Record<string, string> = {
  FIXED_PRICE: "Fixed price",
  AUCTION: "Auction",
};

export default async function SellerListingsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("SELLER")) redirect("/");

  const listings = await prisma.originalListing.findMany({
    where: { artwork: { sellerId: user.id } },
    include: {
      artwork: { include: { images: { where: { isPrimary: true }, take: 1, select: { url: true, thumbnailUrl: true, gridUrl: true } } } },
      auction: { select: { bidCount: true, endAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

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
            href="/seller/apparel/new"
            className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          >
            + Apparel listing
          </Link>
          <Link
            href="/seller/listings/new"
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
          >
            + Artwork listing
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
          {listings.map((listing) => {
            const artwork = listing.artwork;
            const img = artwork.images[0];
            const statusCfg = STATUS_STYLES[listing.status] ?? { pill: "bg-stone-100 text-stone-500", label: listing.status };
            const canToggle = listing.status !== "SOLD";
            const hasBids = (listing.auction?.bidCount ?? 0) > 0;

            return (
              <div key={listing.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                {/* Row 1 on mobile: thumbnail + title/meta */}
                <div className="flex items-center gap-3 min-w-0">
                  <Link href={`/artwork/${artwork.id}`} className="h-14 w-14 shrink-0 rounded-xl overflow-hidden bg-stone-100 hover:opacity-80 transition-opacity">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img.thumbnailUrl ?? img.gridUrl ?? img.url} alt={artwork.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-stone-300 text-xs">No image</div>
                    )}
                  </Link>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{artwork.title}</p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-stone-400">{SALE_TYPE_LABEL[listing.saleType]}</span>
                      {listing.price && (
                        <span className="text-xs text-stone-400">
                          · {listing.saleType === "AUCTION" ? "Start" : ""} ${Number(listing.price).toLocaleString()}
                        </span>
                      )}
                      {listing.auction && (
                        <span className="text-xs text-stone-400">
                          · Ends {new Date(listing.auction.endAt).toLocaleDateString()}
                        </span>
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
                      href={`/seller/listings/${listing.id}/edit`}
                      className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors"
                    >
                      Edit
                    </Link>
                    {canToggle && (
                      <form
                        action={async () => {
                          "use server";
                          await toggleListingStatusAction(listing.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-50 transition-colors"
                        >
                          {listing.status === "ACTIVE" ? "Archive" : "Activate"}
                        </button>
                      </form>
                    )}
                    <DeleteListingButton
                      listingId={listing.id}
                      isSold={listing.status === "SOLD"}
                      hasBids={hasBids}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
