import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTeemillCatalogRows, type CostSortDir } from "@/lib/admin/teemill-catalog";
import { getPricingConfig } from "@/lib/pricing/config";
import UsLandedCostBadge from "@/components/pricing/UsLandedCostBadge";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function TeemillCatalogPage({ searchParams }: PageProps) {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const params = await searchParams;
  const sort: CostSortDir | undefined = params.sort === "desc" ? "desc" : params.sort === "asc" ? "asc" : undefined;

  const [rows, thresholds] = await Promise.all([getTeemillCatalogRows(sort), getPricingConfig()]);
  const nextSort = sort === "asc" ? "desc" : "asc";

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Teemill catalog — US-landed cost</h1>
          <p className="mt-1 text-sm text-stone-500">
            Founder reference: what each referenced garment costs to land to a US buyer. Color band
            from the thresholds set in{" "}
            <Link href="/admin/settings" className="underline hover:text-stone-700">Admin Settings</Link>.
          </p>
        </div>
        <Link
          href={`/admin/teemill-catalog?sort=${nextSort}`}
          className="shrink-0 rounded-full border border-stone-300 px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
        >
          Sort by cost {sort === "asc" ? "↑" : sort === "desc" ? "↓" : ""}
        </Link>
      </div>

      <p className="mb-3 text-xs text-stone-400">
        Bands: green ≤ ${(thresholds.amberAboveCents / 100).toFixed(2)} · amber ≤ $
        {(thresholds.redAboveCents / 100).toFixed(2)} · red above
      </p>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs text-stone-400">
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">US-landed cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-8 text-center text-stone-400">No referenced listings yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3">
                    <Link href={`/seller/apparel/${r.id}/edit`} className="text-stone-800 hover:underline">{r.title}</Link>
                    {r.sellerName && <span className="ml-2 text-xs text-stone-400">{r.sellerName}</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-stone-500">{r.status}</td>
                  <td className="px-5 py-3">
                    <UsLandedCostBadge cost={r.usLandedCost} thresholds={thresholds} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
