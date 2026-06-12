import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { updateProductTypeAction } from "@/app/actions/admin/product-catalog";

interface Props {
  params: Promise<{ id: string }>;
}

interface TeemillProduct {
  item_code: string;
  name: string;
  colours: Record<string, string>; // color name → image URL
}

async function fetchTeemillCatalog(): Promise<TeemillProduct[]> {
  try {
    const res = await fetch("https://teemill.com/omnis/v3/product/options", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

export default async function EditProductTypePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const pt = await prisma.productType.findUnique({
    where: { id },
    include: { colors: { orderBy: { colorName: "asc" } } },
  });
  if (!pt) notFound();

  // For Teemill products pull the catalog so we can show images
  let teemillProduct: TeemillProduct | null = null;
  if (pt.fulfillmentProvider === "TEEMILL") {
    const catalog = await fetchTeemillCatalog();
    teemillProduct = catalog.find((p) => p.item_code === pt.providerSkuBase) ?? null;
  }

  // Build a color-name → imageUrl map from the Teemill catalog entry
  const colorImageMap: Record<string, string> = teemillProduct
    ? teemillProduct.colours
    : {};

  // Hero image: prefer a non-gray color so the shirt is visible against the background
  const heroImageUrl = (() => {
    if (!teemillProduct) return null;
    const entries = Object.entries(teemillProduct.colours);
    const nonGray = entries.find(([name]) => !/gr[ae]y/i.test(name));
    return (nonGray ?? entries[0])?.[1] ?? null;
  })();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 space-y-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{pt.name}</h1>
          <p className="mt-1 text-sm text-stone-400 font-mono">{pt.providerSkuBase}</p>
        </div>
        <a href="/admin/products" className="text-sm text-stone-500 hover:text-stone-800">
          ← Back to catalog
        </a>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.4fr]">

        {/* Left: hero image */}
        <div className="space-y-4">
          {heroImageUrl ? (
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroImageUrl}
                alt={pt.name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 aspect-square flex items-center justify-center text-sm text-stone-400">
              No image available
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              pt.isActive
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-stone-100 text-stone-500 ring-1 ring-stone-200"
            }`}>
              {pt.isActive ? "Active" : "Inactive"}
            </span>
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-cerulean/10 text-cerulean ring-1 ring-cerulean/20">
              {pt.fulfillmentProvider === "TEEMILL" ? "T-Mill" : "Prodigi"}
            </span>
          </div>
        </div>

        {/* Right: details + colors */}
        <div className="space-y-8">

          {/* Details form */}
          <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-7">
            <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider mb-5">
              Product details
            </h2>
            <form
              action={async (fd) => {
                "use server";
                const result = await updateProductTypeAction(id, fd);
                if ("id" in result) redirect(`/admin/products/${result.id}`);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  required
                  defaultValue={pt.name}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  defaultValue={pt.description ?? ""}
                  rows={2}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>

              {/* Hidden — provider and SKU are set at creation; not editable here */}
              <input type="hidden" name="fulfillmentProvider" value={pt.fulfillmentProvider} />
              <input type="hidden" name="providerSkuBase" value={pt.providerSkuBase} />

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="isActive"
                  id="isActive"
                  value="true"
                  defaultChecked={pt.isActive}
                  className="h-4 w-4 rounded border-stone-300"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-stone-700">
                  Active
                </label>
                <input type="hidden" name="isActive" value="false" />
              </div>

              <button
                type="submit"
                className="rounded-full bg-stone-900 px-6 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
              >
                Save changes
              </button>
            </form>
          </section>

          {/* Colors — read-only, sourced from the provider */}
          <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-7">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
                Colors
              </h2>
              <span className="text-xs text-stone-400">
                {pt.colors.length} available · all offered to sellers
              </span>
            </div>

            {pt.colors.length === 0 ? (
              <p className="text-sm text-stone-400">
                No colors synced. Re-create this product type to pull colors from the provider.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pt.colors.map((c) => {
                  const imgUrl = colorImageMap[c.colorName] ?? null;
                  return (
                    <div key={c.id} className="group relative">
                      {imgUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imgUrl}
                          alt={c.colorName}
                          className="h-12 w-12 rounded-lg object-cover border border-stone-200"
                        />
                      ) : (
                        <div
                          className="h-12 w-12 rounded-lg border border-stone-200 bg-stone-200 flex items-center justify-center text-xs text-stone-400"
                          title={c.colorName}
                        >
                          {c.colorName.slice(0, 2)}
                        </div>
                      )}
                      <span className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-stone-800 px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 z-10">
                        {c.colorName}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-8 text-xs text-stone-400">
              Colors are determined by the fulfillment provider and cannot be restricted here.
              Sellers choose which colors to offer when creating a listing.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
