import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTaxRegistrations } from "@/lib/tax/nexus";
import { getPendingTaxCertificateQueue } from "@/lib/tax/approvals";
import { approveTaxCertificateAction, rejectTaxCertificateAction } from "@/app/actions/tax";

export const dynamic = "force-dynamic";

const STRIPE_TAX_REPORTS_URL = "https://dashboard.stripe.com/tax/reports";
const STRIPE_TAX_REGISTRATIONS_URL = "https://dashboard.stripe.com/tax/registrations";

/**
 * Admin Tax surface (US-5.3). Tax collection reports live in the Stripe Dashboard
 * (Tax → Reports, exportable as CSV) — we link out with how-to copy rather than
 * rebuilding reporting in-app. Surfaces Stripe Tax nexus registrations (threshold
 * alerts are emailed by Stripe) and the buyer tax-exemption approval queue (US-5.2).
 * Single-seller: Stripe Connect per-seller 1099-K reporting is out of scope.
 */
export default async function AdminTaxPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const [registrations, pending] = await Promise.all([
    getTaxRegistrations().catch(() => []),
    getPendingTaxCertificateQueue(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 space-y-10">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">Tax &amp; Compliance</h1>
        <p className="mt-1 text-sm text-stone-500">
          Stripe Tax calculates and reports tax. It does not file — filing in jurisdictions where
          we have an obligation remains a manual responsibility.
        </p>
      </header>

      {/* Reports */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-800">Tax collection reports</h2>
        <p className="mt-1 text-sm text-stone-600">
          Tax collected is reported in the Stripe Dashboard under <strong>Tax → Reports</strong>,
          exportable as CSV for filing. Pick a date range and jurisdiction, export, and hand to
          your accountant or use it to file.
        </p>
        <a
          href={STRIPE_TAX_REPORTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
        >
          Open Stripe Tax reports →
        </a>
      </section>

      {/* Nexus monitoring */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-800">Nexus monitoring</h2>
          <a href={STRIPE_TAX_REGISTRATIONS_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-stone-500 hover:text-stone-900">
            Manage registrations →
          </a>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Stripe monitors economic-nexus thresholds and emails the account when we approach or
          cross a registration threshold in a new jurisdiction. We only collect tax where we are
          registered below.
        </p>
        {registrations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
            No active tax registrations. Add registrations in the Stripe Dashboard before enabling
            tax collection.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100 text-sm">
            {registrations.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span className="font-medium text-stone-900">
                  {[r.country, r.state].filter(Boolean).join(" · ")}
                </span>
                <span className="text-xs uppercase tracking-wide text-stone-500">{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tax-exemption approvals (US-5.2) */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-800">
          Tax-exemption certificates — pending review ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
            No certificates awaiting review.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pending.map((c) => (
              <li key={c.certificateId} className="rounded-xl border border-stone-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm">
                    <p className="font-medium text-stone-900">{c.buyerName}</p>
                    <p className="text-stone-500">{c.buyerEmail}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      Type: {c.exemptionType} · uploaded {new Date(c.uploadedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                    </p>
                    <a href={c.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-stone-600 underline hover:text-stone-900">
                      View certificate
                    </a>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={async () => { "use server"; await approveTaxCertificateAction(c.certificateId); }}>
                      <button type="submit" className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 transition-colors">
                        Approve
                      </button>
                    </form>
                    <form action={async () => { "use server"; await rejectTaxCertificateAction(c.certificateId); }}>
                      <button type="submit" className="rounded-full border border-stone-300 px-4 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors">
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
