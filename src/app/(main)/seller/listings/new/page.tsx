import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";

interface ListingChoice {
  href: string;
  title: string;
  description: string;
}

const CHOICES: ListingChoice[] = [
  {
    href: "/seller/listings/new/artwork",
    title: "Artwork listing",
    description:
      "Sell a single original piece, with the option to offer professional prints on the same page.",
  },
  {
    href: "/seller/apparel/new",
    title: "Apparel listing",
    description:
      "Whitelisted products from dropshippers that print your uploaded design via API (Prodigi).",
  },
  {
    href: "/seller/apparel/new-referenced",
    title: "Referenced listing",
    description:
      "For dropshippers where you build the product in their editor, then link it here by reference (Teemill).",
  },
];

export default async function NewListingChooserPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("SELLER")) redirect("/");

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Link href="/seller/listings" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">
          ← Back to listings
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900">New listing</h1>
        <p className="mt-1 text-sm text-stone-500">What would you like to list?</p>
      </div>

      <div className="space-y-4">
        {CHOICES.map((choice) => (
          <Link
            key={choice.href}
            href={choice.href}
            className="group flex items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-colors hover:border-stone-400"
          >
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-stone-900">{choice.title}</h2>
              <p className="mt-1 text-sm text-stone-500">{choice.description}</p>
            </div>
            <span className="shrink-0 self-center text-stone-300 transition-colors group-hover:text-stone-600" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
