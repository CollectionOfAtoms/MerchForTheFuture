import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAdminProductCatalog } from "@/lib/admin/product-catalog";

interface TeemillProduct {
  item_code: string;
  colours: Record<string, string>;
}

async function fetchTeemillImageMap(): Promise<Record<string, string>> {
  try {
    const res = await fetch("https://teemill.com/omnis/v3/product/options", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return {};
    const data = await res.json();
    const products: TeemillProduct[] = data.data ?? [];
    // item_code → first non-gray/non-white image URL
    const map: Record<string, string> = {};
    for (const p of products) {
      const entries = Object.entries(p.colours);
      const picked = entries.find(([name]) => !/gr[ae]y|white/i.test(name)) ?? entries[0];
      if (picked) map[p.item_code] = picked[1];
    }
    return map;
  } catch {
    return {};
  }
}

export async function AdminProductsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const [products, teemillImageMap] = await Promise.all([
    getAdminProductCatalog(),
    fetchTeemillImageMap(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Product Catalog</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {products.length} product type{products.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
        >
          Add type
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-24 text-center">
          <p className="text-stone-400 text-sm">No product types yet.</p>
          <Link
            href="/admin/products/new"
            className="mt-4 inline-block text-sm font-medium text-stone-700 underline"
          >
            Add the first one
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {products.map((pt) => {
            const thumbUrl =
              pt.fulfillmentProvider === "TEEMILL"
                ? teemillImageMap[pt.providerSkuBase] ?? null
                : null;

            return (
              <li key={pt.id}>
                <Link
                  href={`/admin/products/${pt.id}`}
                  className={`flex items-center gap-4 rounded-2xl border bg-white shadow-sm px-4 py-3 hover:shadow-md transition-shadow ${
                    pt.isActive ? "border-stone-200" : "border-stone-200 opacity-50"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-stone-200">
                    {thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrl}
                        alt={pt.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-stone-400">
                        —
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-stone-900 truncate">{pt.name}</p>
                    <p className="text-xs text-stone-400 mt-0.5 font-mono truncate">
                      {pt.providerSkuBase}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-stone-500">
                        {pt.fulfillmentProvider === "TEEMILL" ? "T-Mill" : "Prodigi"}
                      </span>
                      <span className="text-stone-300">·</span>
                      <span className="text-xs text-stone-500">
                        {pt.activeColorCount} color{pt.activeColorCount !== 1 ? "s" : ""}
                      </span>
                      <span className="text-stone-300">·</span>
                      {pt.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500 ring-1 ring-stone-200">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-stone-300"
                    aria-hidden="true"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default AdminProductsPage;
