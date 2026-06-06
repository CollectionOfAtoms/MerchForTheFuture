import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import {
  updateProfileAction,
  addAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  updateNotificationPrefsAction,
} from "@/app/actions/account";

export default async function BuyerSettingsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[]; name?: string; email?: string } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("BUYER")) redirect("/");

  const [dbUser, addresses] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.userAddress.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
  ]);

  const notifPrefs = (dbUser?.loginMetadata as { notifications?: { outbidEmails?: boolean } } | null)?.notifications;
  const outbidEmailsEnabled = notifPrefs?.outbidEmails !== false;

  const inputClass = "w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900";
  const labelClass = "block text-xs font-medium text-stone-600 mb-1";

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <h1 className="text-2xl font-semibold text-stone-900">Account Settings</h1>

      {/* Profile */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-stone-700">Profile</h2>
        <form action={async (fd) => { "use server"; await updateProfileAction(fd); }} className="space-y-3">
          <div>
            <label className={labelClass}>Name</label>
            <input
              name="name"
              defaultValue={dbUser?.name ?? ""}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              value={dbUser?.email ?? ""}
              readOnly
              className="w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm text-stone-500 cursor-not-allowed"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
          >
            Save Profile
          </button>
        </form>
      </section>

      {/* Billing */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-stone-700">Billing</h2>
        <p className="text-sm text-stone-600">
          Manage your saved payment methods securely via Stripe.
        </p>
        <form action="/api/stripe/portal" method="POST">
          <button
            type="submit"
            className="rounded-full border border-stone-900 px-5 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50 transition-colors"
          >
            Manage Payment Methods →
          </button>
        </form>
      </section>

      {/* Shipping Addresses */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-stone-700">Shipping Addresses</h2>

        {addresses.length > 0 && (
          <ul className="divide-y divide-stone-100">
            {addresses.map((addr) => (
              <li key={addr.id} className="py-3 flex items-start justify-between gap-4">
                <div className="text-sm text-stone-900">
                  <p className="font-medium">
                    {addr.name}
                    {addr.isDefault && (
                      <span className="ml-2 text-xs text-emerald-700 font-medium">Default</span>
                    )}
                  </p>
                  <p className="text-stone-600">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}</p>
                  <p className="text-stone-600">{addr.city}{addr.state ? `, ${addr.state}` : ""} {addr.postal}, {addr.country}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!addr.isDefault && (
                    <form action={async () => { "use server"; await setDefaultAddressAction(addr.id); }}>
                      <button type="submit" className="text-xs text-stone-600 hover:text-stone-900">Set default</button>
                    </form>
                  )}
                  <form action={async () => { "use server"; await deleteAddressAction(addr.id); }}>
                    <button type="submit" className="text-xs text-rose-600 hover:text-rose-800">Remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <details className="mt-2">
          <summary className="text-sm text-stone-700 cursor-pointer hover:text-stone-900 font-medium">+ Add address</summary>
          <form action={async (fd) => { "use server"; await addAddressAction(fd); }} className="mt-4 grid grid-cols-2 gap-3">
            {[
              { name: "name", label: "Full name", span: 2 },
              { name: "line1", label: "Street address", span: 2 },
              { name: "line2", label: "Apt, suite, etc. (optional)", span: 2 },
              { name: "city", label: "City", span: 1 },
              { name: "state", label: "State / Province", span: 1 },
              { name: "postal", label: "Postal code", span: 1 },
              { name: "country", label: "Country", span: 1 },
            ].map((f) => (
              <div key={f.name} className={f.span === 2 ? "col-span-2" : ""}>
                <label className={labelClass}>{f.label}</label>
                <input
                  name={f.name}
                  defaultValue={f.name === "country" ? "US" : ""}
                  className={inputClass}
                />
              </div>
            ))}
            <div className="col-span-2">
              <button
                type="submit"
                className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
              >
                Save Address
              </button>
            </div>
          </form>
        </details>
      </section>

      {/* Notifications */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-stone-700">Notifications</h2>
        <form action={async (fd) => { "use server"; await updateNotificationPrefsAction(fd); }} className="flex items-center justify-between">
          <label className="text-sm text-stone-900">Receive outbid email alerts</label>
          <div className="flex items-center gap-3">
            <input type="hidden" name="outbidEmails" value="false" />
            <input
              type="checkbox"
              name="outbidEmails"
              value="true"
              defaultChecked={outbidEmailsEnabled}
              className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
            />
            <button
              type="submit"
              className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-700 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
