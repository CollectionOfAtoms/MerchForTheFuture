import { redirect } from "next/navigation";
import { requireVerifiedAuth } from "@/lib/auth/guards";
import { readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import {
  computeTrackerSummary,
  getAdminSiteMetrics,
  getAdminRecentActivity,
} from "@/lib/dashboard/admin";

export default async function AdminDashboardPage() {
  const user = await requireVerifiedAuth();
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const [raw, metrics, activity] = await Promise.all([
    readFile(path.join(process.cwd(), "spec", "project-tracker.json"), "utf-8"),
    getAdminSiteMetrics(),
    getAdminRecentActivity(),
  ]);

  const trackerData = JSON.parse(raw);
  const tracker = computeTrackerSummary(trackerData);

  return (
    <main className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-cerulean">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-dark-cyan">Site health and development progress at a glance.</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/fulfillment"
              className="flex-1 sm:flex-none text-center rounded-full bg-cerulean px-4 py-2 text-sm font-medium text-white hover:bg-dark-cyan transition-colors"
            >
              Fulfillment queue →
            </Link>
            <Link
              href="/admin/tracker"
              className="flex-1 sm:flex-none text-center rounded-full border border-tuscan-sun/40 px-4 py-2 text-sm font-medium text-blue-slate hover:bg-tuscan-sun/10 transition-colors"
            >
              Full tracker →
            </Link>
          </div>
        </div>

        {/* Tracker summary */}
        <section className="rounded-2xl border border-tuscan-sun/30 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-blue-slate mb-4">Project Tracker</h2>

          {/* Overall progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-dark-cyan">Overall completion</span>
              <span className="text-xs text-dark-cyan">
                {tracker.byStatus["Passed"] ?? 0} / {tracker.totalStories} passed ({tracker.passedPercent.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-tuscan-sun/10">
              <div className="flex h-full">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${tracker.passedPercent}%` }}
                />
                <div
                  className="h-full bg-amber-400 transition-all"
                  style={{
                    width: `${tracker.totalStories === 0 ? 0 : ((tracker.byStatus["Test Written"] ?? 0) / tracker.totalStories) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-blue-slate/50">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Passed ({tracker.byStatus["Passed"] ?? 0})</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Test Written ({tracker.byStatus["Test Written"] ?? 0})</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-slate/30" /> Not Started ({tracker.byStatus["Not Started"] ?? 0})</span>
              {(tracker.byStatus["Deferred"] ?? 0) > 0 && (
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-300" /> Deferred ({tracker.byStatus["Deferred"]})</span>
              )}
            </div>
          </div>

          {/* Per-epic progress */}
          <div className="space-y-2 mt-6">
            {tracker.byEpic.map((e) => (
              <div key={e.epic} className="flex items-center gap-3">
                <span className="w-56 shrink-0 text-xs text-blue-slate truncate">{e.epic}</span>
                <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-tuscan-sun/10">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${e.total === 0 ? 0 : (e.passed / e.total) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs text-blue-slate/50">{e.passed}/{e.total}</span>
              </div>
            ))}
          </div>

          {/* Pending stories */}
          {tracker.pendingStories.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold text-dark-cyan uppercase tracking-wide mb-2">Up next</h3>
              <ul className="space-y-1">
                {tracker.pendingStories.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs text-blue-slate">
                    <span className="font-mono text-blue-slate/50 w-12 shrink-0">{s.id}</span>
                    <span>{s.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Site metrics */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Active listings", value: metrics.listings.active },
            { label: "Sold listings", value: metrics.listings.sold },
            { label: "Total users", value: metrics.users.total },
            { label: "Sellers", value: metrics.users.sellers },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-tuscan-sun/30 bg-white p-5 shadow-sm">
              <p className="text-2xl font-semibold text-cerulean">{stat.value}</p>
              <p className="mt-1 text-xs text-dark-cyan">{stat.label}</p>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-3 gap-4 text-xs text-dark-cyan">
          <div className="rounded-xl border border-tuscan-sun/20 bg-white p-4">
            <p className="font-medium text-blue-slate mb-1">Users by role</p>
            <p>Buyers: {metrics.users.buyers}</p>
            <p>Sellers: {metrics.users.sellers}</p>
            <p>Admins: {metrics.users.admins}</p>
          </div>
          <div className="rounded-xl border border-tuscan-sun/20 bg-white p-4">
            <p className="font-medium text-blue-slate mb-1">Listings by status</p>
            <p>Active: {metrics.listings.active}</p>
            <p>Sold: {metrics.listings.sold}</p>
            <p>Archived: {metrics.listings.archived}</p>
          </div>
          <div className="rounded-xl border border-tuscan-sun/20 bg-white p-4">
            <p className="font-medium text-blue-slate mb-1">Total listings</p>
            <p className="text-2xl font-semibold text-cerulean">{metrics.listings.total}</p>
          </div>
        </section>

        {/* Recent activity */}
        <section className="rounded-2xl border border-tuscan-sun/30 bg-white shadow-sm">
          <div className="border-b border-tuscan-sun/20 px-6 py-4">
            <h2 className="text-sm font-semibold text-blue-slate">Recent Activity</h2>
          </div>
          {activity.length === 0 ? (
            <p className="px-6 py-8 text-sm text-blue-slate/50 text-center">No recent activity.</p>
          ) : (
            <ul className="divide-y divide-tuscan-sun/10">
              {activity.map((event, i) => (
                <li key={i} className="flex items-center gap-4 px-6 py-3">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${
                    event.type === "new_listing" ? "bg-emerald-400" :
                    event.type === "bid_placed" ? "bg-amber-400" : "bg-sky-400"
                  }`} />
                  <span className="flex-1 text-sm text-blue-slate">{event.description}</span>
                  <span className="text-xs text-blue-slate/50 shrink-0">
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
