import { redirect } from "next/navigation";
import { auth } from "@/auth";
import NewReferencedListingForm from "@/components/seller/NewReferencedListingForm";

export default async function NewReferencedListingPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("SELLER")) redirect("/");

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-900">New referenced listing</h1>
        <p className="mt-1 text-sm text-stone-500">
          Reference a product you built on Teemill, set a USD price, and add photos.
        </p>
      </div>

      <NewReferencedListingForm />
    </div>
  );
}
