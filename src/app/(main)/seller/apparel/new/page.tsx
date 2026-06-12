import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getActiveProductTypesForListing } from "@/lib/apparel/listings";
import NewApparelListingForm from "@/components/seller/NewApparelListingForm";

export default async function NewApparelListingPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("SELLER")) redirect("/");

  const productTypes = await getActiveProductTypesForListing();

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-900">New apparel listing</h1>
        <p className="mt-1 text-sm text-stone-500">
          Choose a product, upload your design and photos, pick your colors, and set a price.
        </p>
      </div>

      <NewApparelListingForm productTypes={productTypes} />
    </div>
  );
}
