import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createProductTypeAction } from "@/app/actions/admin/product-catalog";

export default async function NewProductTypePage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-stone-900 mb-8">Add product type</h1>

      <form
        action={async (fd) => {
          "use server";
          const result = await createProductTypeAction(fd);
          if ("id" in result) redirect(`/admin/products/${result.id}`);
        }}
        className="space-y-6 rounded-2xl border border-stone-200 bg-white shadow-sm p-8"
      >
        <ProductTypeFormFields />

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-full bg-stone-900 px-6 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
          >
            Create
          </button>
          <a href="/admin/products" className="rounded-full border border-stone-300 px-6 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}

function ProductTypeFormFields({ defaults }: { defaults?: Record<string, string> } = {}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Name <span className="text-red-500">*</span></label>
        <input
          name="name"
          required
          defaultValue={defaults?.name}
          placeholder="e.g. Unisex Tee"
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
        <textarea
          name="description"
          defaultValue={defaults?.description}
          rows={2}
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Fulfillment provider <span className="text-red-500">*</span></label>
        <select
          name="fulfillmentProvider"
          defaultValue={defaults?.fulfillmentProvider ?? "TEEMILL"}
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
        >
          <option value="TEEMILL">T-Mill</option>
          <option value="PRODIGI">Prodigi</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Provider SKU base <span className="text-red-500">*</span></label>
        <input
          name="providerSkuBase"
          required
          defaultValue={defaults?.providerSkuBase}
          placeholder="e.g. RNA1"
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          name="isActive"
          id="isActive"
          value="true"
          defaultChecked={defaults?.isActive !== "false"}
          className="h-4 w-4 rounded border-stone-300"
        />
        <label htmlFor="isActive" className="text-sm font-medium text-stone-700">Active</label>
        <input type="hidden" name="isActive" value="false" />
      </div>
    </>
  );
}

export { ProductTypeFormFields };
