import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createProductTypeAction } from "@/app/actions/admin/product-catalog";
import ProductTypeForm from "@/components/admin/ProductTypeForm";

export default async function NewProductTypePage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-stone-900 mb-8">Add product type</h1>

      <form
        action={async (fd) => {
          "use server";
          const result = await createProductTypeAction(fd);
          if ("id" in result) redirect(`/admin/products/${result.id}`);
        }}
        className="space-y-6 rounded-2xl border border-stone-200 bg-white shadow-sm p-8"
      >
        <ProductTypeForm />

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
