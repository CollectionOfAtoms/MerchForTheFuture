import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import ProfileForm from "@/app/(main)/settings/ProfileForm";
import PricingThresholdsForm from "@/components/admin/PricingThresholdsForm";
import { getPricingConfig } from "@/lib/pricing/config";

export default async function AdminSettingsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const [dbUser, thresholds] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    getPricingConfig(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <h1 className="text-2xl font-semibold text-stone-900">Admin Settings</h1>

      {/* Profile */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-stone-700">Profile</h2>
        <ProfileForm defaultName={dbUser?.name ?? ""} email={dbUser?.email ?? ""} />
      </section>

      {/* US-landed-cost band thresholds (US-MFTF-19.6) */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-stone-700">US-landed cost bands</h2>
          <Link href="/admin/teemill-catalog" className="text-xs text-stone-500 underline hover:text-stone-700">
            Teemill catalog →
          </Link>
        </div>
        <PricingThresholdsForm
          amberAbove={thresholds.amberAboveCents / 100}
          redAbove={thresholds.redAboveCents / 100}
        />
      </section>
    </div>
  );
}
