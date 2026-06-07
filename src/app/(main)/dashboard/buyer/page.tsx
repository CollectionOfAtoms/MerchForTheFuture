import { redirect } from "next/navigation";
import Link from "next/link";
import { getBuyerActiveBids, getBuyerTopBids, getBuyerOrderHistory } from "@/lib/dashboard/buyer";
import { requireVerifiedAuth } from "@/lib/auth/guards";

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export default async function BuyerDashboardPage() {
  const user = await requireVerifiedAuth();
  if (!user.roles?.includes("BUYER")) redirect("/");

  const [activeBids, topBids, orderHistory] = await Promise.all([
    getBuyerActiveBids(user.id),
    getBuyerTopBids(user.id),
    getBuyerOrderHistory(user.id),
  ]);

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">My Dashboard</h1>
          <p className="mt-1 text-sm text-stone-500">Your bids and purchases at a glance.</p>
        </div>

        {/* Winning bids highlight */}
        {topBids.length > 0 && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-emerald-800 mb-4">
              Winning — You&apos;re the highest bidder on {topBids.length} auction{topBids.length !== 1 ? "s" : ""}
            </h2>
            <ul className="space-y-3">
              {topBids.map((bid) => (
                <li key={bid.auctionId} className="flex items-center gap-4">
                  <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-emerald-100">
                    {bid.artwork.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={bid.artwork.images[0].url} alt={bid.artwork.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-emerald-300 text-xs">—</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-900 truncate">{bid.artwork.title}</p>
                    <p className="text-xs text-emerald-600">
                      Your bid: ${Number(bid.myHighestBid).toLocaleString()} · Ends {new Date(bid.endAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Link
                    href={`/listings/${bid.listingId}`}
                    className="shrink-0 text-xs text-emerald-700 hover:text-emerald-900 transition-colors"
                  >
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* All active bids */}
        <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-stone-700">My Active Bids</h2>
          </div>

          {activeBids.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-stone-400 mb-3">You have no active bids.</p>
              <Link
                href="/browse?type=auction"
                className="inline-block rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
              >
                Browse auctions
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-stone-50">
              {activeBids.map((bid) => (
                <li key={bid.auctionId} className="flex items-center gap-4 px-6 py-4">
                  <div className="h-12 w-12 shrink-0 rounded-xl overflow-hidden bg-stone-100">
                    {bid.artwork.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={bid.artwork.images[0].url} alt={bid.artwork.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-stone-300 text-xs">—</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{bid.artwork.title}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      My bid: ${Number(bid.myHighestBid).toLocaleString()}
                      {bid.currentBid && (
                        <> · Current: ${Number(bid.currentBid).toLocaleString()}</>
                      )}
                      · Ends {new Date(bid.endAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    bid.isWinning
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {bid.isWinning ? "Winning" : "Outbid"}
                  </span>
                  <Link
                    href={`/listings/${bid.listingId}`}
                    className="shrink-0 text-xs text-stone-500 hover:text-stone-700 transition-colors"
                  >
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Order history */}
        <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-stone-700">Order History</h2>
          </div>

          {orderHistory.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-stone-400 mb-3">No purchases yet.</p>
              <Link
                href="/browse"
                className="inline-block rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
              >
                Browse artwork
              </Link>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-stone-50">
                {orderHistory.map((order) => (
                  <li key={order.id}>
                    <Link href={`/buyer/orders/${order.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-colors">
                      <div className="h-12 w-12 shrink-0 rounded-xl overflow-hidden bg-stone-100">
                        {order.artwork?.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={order.artwork.images[0].url} alt={order.artwork.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-stone-300 text-xs">—</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">
                          {order.artwork?.title ?? "Print order"}
                        </p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString()} · ${Number(order.totalAmount).toLocaleString()}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium bg-stone-100 text-stone-600">
                        {ORDER_STATUS_LABEL[order.status] ?? order.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="border-t border-stone-100 px-6 py-3 text-right">
                <Link href="/buyer/orders" className="text-xs text-stone-500 hover:text-stone-800 transition-colors">
                  View all orders →
                </Link>
              </div>
            </>
          )}
        </section>

      </div>
    </main>
  );
}
