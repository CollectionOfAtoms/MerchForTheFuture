import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAdminProductCatalog } from "@/lib/admin/product-catalog";

export async function AdminProductsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const products = await getAdminProductCatalog();

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Product Catalog</h1>
          <p className="text-sm text-stone-500 mt-1">{products.length} product type{products.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/admin/products/new"
          className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
        >
          Add product type
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-24 text-center">
          <p className="text-stone-400 text-sm">No product types yet.</p>
          <Link href="/admin/products/new" className="mt-4 inline-block text-sm font-medium text-stone-700 underline">
            Add the first one
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs font-medium text-stone-500 uppercase tracking-wide">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Provider</th>
                <th className="px-6 py-3 text-center">Colors</th>
                <th className="px-6 py-3 text-center">Sizes</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {products.map((pt) => (
                <tr key={pt.id} className={pt.isActive ? "" : "opacity-50"}>
                  <td className="px-6 py-4 font-medium text-stone-900">{pt.name}</td>
                  <td className="px-6 py-4 text-stone-600">{pt.fulfillmentProvider === "TEEMILL" ? "T-Mill" : "Prodigi"}</td>
                  <td className="px-6 py-4 text-center text-stone-600">{pt.activeColorCount}</td>
                  <td className="px-6 py-4 text-center text-stone-600">{pt.activeSizeCount}</td>
                  <td className="px-6 py-4">
                    {pt.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/admin/products/${pt.id}`} className="text-sm font-medium text-stone-700 hover:text-stone-900">
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminProductsPage;
