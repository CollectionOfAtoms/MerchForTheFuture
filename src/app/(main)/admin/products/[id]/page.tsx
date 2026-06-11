import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  updateProductTypeAction,
  addProductTypeColorAction,
  toggleProductTypeColorAction,
  addProductTypeSizeAction,
  toggleProductTypeSizeAction,
} from "@/app/actions/admin/product-catalog";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProductTypePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const pt = await prisma.productType.findUnique({
    where: { id },
    include: {
      colors: { orderBy: { colorName: "asc" } },
      sizes:  { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!pt) notFound();

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Edit: {pt.name}</h1>
        <a href="/admin/products" className="text-sm text-stone-500 hover:text-stone-800">← Back to catalog</a>
      </div>

      {/* ── Main fields ── */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-8">
        <h2 className="text-base font-semibold text-stone-800 mb-6">Product details</h2>
        <form
          action={async (fd) => {
            "use server";
            const result = await updateProductTypeAction(id, fd);
            if ("id" in result) redirect(`/admin/products/${result.id}`);
          }}
          className="space-y-5"
        >
          <Field label="Name" name="name" defaultValue={pt.name} required />
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
            <textarea name="description" defaultValue={pt.description ?? ""} rows={2}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Fulfillment provider</label>
            <select name="fulfillmentProvider" defaultValue={pt.fulfillmentProvider}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900">
              <option value="TEEMILL">T-Mill</option>
              <option value="PRODIGI">Prodigi</option>
            </select>
          </div>
          <Field label="Provider SKU base" name="providerSkuBase" defaultValue={pt.providerSkuBase} required />
          <div className="flex items-center gap-3">
            <input type="checkbox" name="isActive" id="isActive" value="true" defaultChecked={pt.isActive} className="h-4 w-4 rounded border-stone-300" />
            <label htmlFor="isActive" className="text-sm font-medium text-stone-700">Active</label>
            <input type="hidden" name="isActive" value="false" />
          </div>
          <button type="submit" className="rounded-full bg-stone-900 px-6 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors">
            Save changes
          </button>
        </form>
      </section>

      {/* ── Colors ── */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-8">
        <h2 className="text-base font-semibold text-stone-800 mb-4">Colors</h2>
        <div className="space-y-2 mb-6">
          {pt.colors.map((c) => (
            <div key={c.id} className={`flex items-center gap-3 text-sm ${c.isActive ? "" : "opacity-40"}`}>
              <span className="inline-block h-4 w-4 rounded-full border border-stone-200" style={{ background: c.colorHex }} />
              <span className="flex-1">{c.colorName}</span>
              <span className="text-stone-400 font-mono text-xs">{c.providerColorCode}</span>
              <form action={async () => {
                "use server";
                await toggleProductTypeColorAction(c.id, !c.isActive);
                redirect(`/admin/products/${id}`);
              }}>
                <button type="submit" className="text-xs text-stone-500 hover:text-stone-800">
                  {c.isActive ? "Deactivate" : "Activate"}
                </button>
              </form>
            </div>
          ))}
        </div>
        <form
          action={async (fd) => {
            "use server";
            await addProductTypeColorAction(id, fd);
            redirect(`/admin/products/${id}`);
          }}
          className="flex gap-2 flex-wrap"
        >
          <input name="colorName" required placeholder="Name" className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 w-32" />
          <input name="colorHex" required placeholder="#FFFFFF" className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 w-28" />
          <input name="providerColorCode" required placeholder="Provider code" className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 w-36" />
          <button type="submit" className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50">
            Add color
          </button>
        </form>
      </section>

      {/* ── Sizes ── */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-8">
        <h2 className="text-base font-semibold text-stone-800 mb-4">Sizes</h2>
        <div className="space-y-2 mb-6">
          {pt.sizes.map((s) => (
            <div key={s.id} className={`flex items-center gap-3 text-sm ${s.isActive ? "" : "opacity-40"}`}>
              <span className="w-12 font-medium">{s.sizeLabel}</span>
              <span className="text-stone-400 font-mono text-xs flex-1">{s.providerSizeCode}</span>
              <span className="text-stone-400 text-xs">order: {s.sortOrder}</span>
              <form action={async () => {
                "use server";
                await toggleProductTypeSizeAction(s.id, !s.isActive);
                redirect(`/admin/products/${id}`);
              }}>
                <button type="submit" className="text-xs text-stone-500 hover:text-stone-800">
                  {s.isActive ? "Deactivate" : "Activate"}
                </button>
              </form>
            </div>
          ))}
        </div>
        <form
          action={async (fd) => {
            "use server";
            await addProductTypeSizeAction(id, fd);
            redirect(`/admin/products/${id}`);
          }}
          className="flex gap-2 flex-wrap"
        >
          <input name="sizeLabel" required placeholder="Label (e.g. M)" className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 w-28" />
          <input name="providerSizeCode" required placeholder="Provider code" className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 w-32" />
          <input name="sortOrder" type="number" placeholder="Sort" defaultValue={pt.sizes.length + 1}
            className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 w-20" />
          <button type="submit" className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50">
            Add size
          </button>
        </form>
      </section>
    </div>
  );
}

function Field({ label, name, defaultValue, required }: { label: string; name: string; defaultValue?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input name={name} required={required} defaultValue={defaultValue}
        className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900" />
    </div>
  );
}
