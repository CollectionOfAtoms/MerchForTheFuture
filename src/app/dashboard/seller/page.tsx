import { redirect } from "next/navigation";
import { requireVerifiedAuth } from "@/lib/auth/guards";
import Link from "next/link";
import {
  getSellerListingSummary,
  getSellerActiveListings,
  getSellerRecentActivity,
  getSellerRevenue,
} from "@/lib/dashboard/seller";

const SALE_TYPE_LABEL: Record<string, string> = {
  FIXED_PRICE: "Fixed price",
  AUCTION: "Auction",
};

export default async function SellerDashboardPage() {
  const user = await requireVerifiedAuth();
  if (!user.roles?.includes("SELLER")) redirect("/");

  const [summary, activeListings, activity, revenue] = await Promise.all([
    getSellerListingSummary(user.id),
    getSellerActiveListings(user.id),
    getSellerRecentActivity(user.id),
    getSellerRevenue(user.id),
  ]);

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Seller Dashboard</h1>
          <p className="mt-1 text-sm text-stone-500">Your listings and activity at a glance.</p>
        </div>

        {/* Listings summary + revenue */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Active", value: summary.active },
            { label: "Sold", value: summary.sold },
            { label: "Archived", value: summary.archived },
            { label: "Total", value: summary.total },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-2xl font-semibold text-stone-900">{stat.value}</p>
              <p className="mt-1 text-xs text-stone-500">{stat.label} listings</p>
            </div>
          ))}
        </div>

        {/* Revenue snapshot */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-700 mb-4">Revenue</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-stone-400 mb-1">Original sales</p>
              <p className="text-xl font-semibold text-stone-900">${revenue.originalRevenue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-stone-400 mb-1">Print sales</p>
              <p className="text-xl font-semibold text-stone-900">${revenue.printRevenue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-stone-400 mb-1">Total net payout</p>
              <p className="text-xl font-semibold text-emerald-700">${revenue.total.toFixed(2)}</p>
            </div>
          </div>
        </section>

        {/* Active listings */}
        <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-700">Active Listings</h2>
            <Link
              href="/seller/listings"
              className="text-xs text-stone-500 hover:text-stone-700 transition-colors"
            >
              Manage all listings →
            </Link>
          </div>

          {activeListings.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-stone-400 mb-4">You have no active listings.</p>
              <Link
                href="/seller/listings/new"
                className="inline-block rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
              >
                Create your first listing
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-stone-50">
              {activeListings.map((listing) => (
                <li key={listing.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="h-12 w-12 shrink-0 rounded-xl overflow-hidden bg-stone-100">
                    {listing.artwork.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={listing.artwork.images[0].thumbnailUrl ?? listing.artwork.images[0].gridUrl ?? listing.artwork.images[0].url}
                        alt={listing.artwork.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-stone-300 text-xs">—</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{listing.artwork.title}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {SALE_TYPE_LABEL[listing.saleType]} · ${Number(listing.price).toLocaleString()}
                      {listing.auction && (
                        <> · Ends {new Date(listing.auction.endAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/seller/listings/${listing.id}/edit`}
                    className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent activity */}
        <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-stone-700">Recent Activity</h2>
          </div>
          {activity.length === 0 ? (
            <p className="px-6 py-8 text-sm text-stone-400 text-center">No recent activity.</p>
          ) : (
            <ul className="divide-y divide-stone-50">
              {activity.map((event, i) => (
                <li key={i} className="flex items-center gap-4 px-6 py-3">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${
                    event.type === "bid_received" ? "bg-amber-400" :
                    event.type === "purchase_completed" ? "bg-emerald-400" : "bg-rose-400"
                  }`} />
                  <span className="flex-1 text-sm text-stone-700">{event.description}</span>
                  <span className="text-xs text-stone-400 shrink-0">
                    {new Date(event.date).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </main>
  );
}
