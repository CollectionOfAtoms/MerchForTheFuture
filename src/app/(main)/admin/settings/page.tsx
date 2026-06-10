import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import ProfileForm from "@/app/(main)/settings/ProfileForm";

export default async function AdminSettingsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <h1 className="text-2xl font-semibold text-stone-900">Admin Settings</h1>

      {/* Profile */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-stone-700">Profile</h2>
        <ProfileForm defaultName={dbUser?.name ?? ""} email={dbUser?.email ?? ""} />
      </section>
    </div>
  );
}
