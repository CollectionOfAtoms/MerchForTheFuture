import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { updateProfileAction } from "@/app/actions/account";

export default async function AdminSettingsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

  const inputClass = "w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900";
  const labelClass = "block text-xs font-medium text-stone-600 mb-1";

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <h1 className="text-2xl font-semibold text-stone-900">Admin Settings</h1>

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
    </div>
  );
}
