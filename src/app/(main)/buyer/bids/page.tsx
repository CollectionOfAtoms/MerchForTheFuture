import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getBuyerAllBids, type BidStatus } from "@/lib/dashboard/buyer";

const STATUS_CONFIG: Record<BidStatus, { label: string; pill: string }> = {
  winning: { label: "Winning",  pill: "bg-emerald-100 text-emerald-700" },
  outbid:  { label: "Outbid",   pill: "bg-amber-100 text-amber-700" },
  won:     { label: "Won",      pill: "bg-sky-100 text-sky-700" },
  lost:    { label: "Lost",     pill: "bg-stone-100 text-stone-500" },
};

export default async function MyBidsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("BUYER")) redirect("/");

  const bids = await getBuyerAllBids(user.id);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-stone-900 mb-8">My Bids</h1>

      {bids.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-24 text-center">
          <p className="text-stone-400 text-sm mb-4">You haven&apos;t placed any bids yet.</p>
          <Link
            href="/browse?type=auction"
            className="inline-block rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
          >
            Browse Auctions
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          {bids.map((bid) => {
            const img = bid.artwork.images[0];
            const statusCfg = STATUS_CONFIG[bid.bidStatus];
            const isActive = bid.auctionStatus === "ACTIVE";
            const myBid = Number(bid.myHighestBid);
            const currentBid = bid.currentBid ? Number(bid.currentBid) : null;

            return (
              <div key={bid.auctionId} className="flex items-center gap-4 px-6 py-4">
                {/* Thumbnail */}
                <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden bg-stone-100">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.url} alt={bid.artwork.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-stone-300 text-xs">—</div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/artwork/${bid.artworkId}`}
                    className="text-sm font-medium text-stone-900 hover:underline truncate block"
                  >
                    {bid.artwork.title}
                  </Link>
                  <div className="mt-1 flex gap-3 text-xs text-stone-500 flex-wrap">
                    <span>My bid: ${myBid.toLocaleString()}</span>
                    {currentBid !== null && (
                      <span>Current: ${currentBid.toLocaleString()}</span>
                    )}
                    {isActive ? (
                      <span>Ends {new Date(bid.endAt).toLocaleDateString()}</span>
                    ) : (
                      <span>Ended {new Date(bid.endAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                {/* Status + action */}
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.pill}`}>
                    {statusCfg.label}
                  </span>
                  {bid.bidStatus === "outbid" && (
                    <Link
                      href={`/artwork/${bid.artworkId}`}
                      className="text-xs text-stone-900 font-medium hover:underline"
                    >
                      Bid again →
                    </Link>
                  )}
                  {bid.bidStatus === "winning" && (
                    <Link
                      href={`/artwork/${bid.artworkId}`}
                      className="text-xs text-stone-500 hover:underline"
                    >
                      View →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
