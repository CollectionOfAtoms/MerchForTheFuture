import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

const categories = [
  {
    href: "/browse",
    label: "Original Art",
    description: "One-of-a-kind works available for direct purchase.",
    accent: "bg-amber-100",
  },
  {
    href: "/browse?type=auction",
    label: "Auctions",
    description: "Bid on exclusive pieces with time-limited listings.",
    accent: "bg-sky-100",
  },
  {
    href: "/browse?type=print",
    label: "Prints",
    description: "Museum-quality prints shipped directly to your door.",
    accent: "bg-emerald-100",
  },
];

const steps = [
  { number: "01", title: "Discover", body: "Browse original works, open auctions, and print collections from independent artists." },
  { number: "02", title: "Bid", body: "Place a bid on time-limited auctions and compete for one-of-a-kind pieces." },
  { number: "03", title: "Collect", body: "Buy directly or order a museum-quality print — shipped straight to your door." },
];

export default async function HomePage() {
  const session = await auth();
  const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (roles.includes("ADMIN")) redirect("/dashboard/admin");
  if (roles.includes("SELLER")) redirect("/dashboard/seller");
  if (roles.includes("BUYER")) redirect("/dashboard/buyer");

  return (
    <div className="flex flex-col">

      {/* Hero */}
      <section className="bg-white border-b border-stone-200">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32 flex flex-col items-start gap-6">
          <p className="text-sm font-medium uppercase tracking-widest text-stone-400">
            Art powered by light
          </p>
          <h1 className="max-w-2xl text-4xl sm:text-5xl font-semibold tracking-tight text-stone-900 leading-tight">
            Collect original art from independent artists around the world.
          </h1>
          <p className="max-w-xl text-lg text-stone-500 leading-relaxed">
            Original paintings, live auctions, and museum-quality prints — all in one place.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/browse"
              className="rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
            >
              Browse artwork
            </Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl w-full px-6 py-16">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-6">
          Shop by type
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              className="group rounded-2xl border border-stone-200 bg-white p-6 hover:border-stone-300 hover:shadow-sm transition-all"
            >
              <div className={`h-12 w-12 rounded-xl ${cat.accent} mb-4`} />
              <p className="font-semibold text-stone-900 group-hover:text-stone-700">{cat.label}</p>
              <p className="mt-1 text-sm text-stone-500">{cat.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-stone-200">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            {steps.map((step) => (
              <div key={step.number}>
                <p className="text-3xl font-bold text-stone-200 mb-3">{step.number}</p>
                <p className="font-semibold text-stone-900 mb-1">{step.title}</p>
                <p className="text-sm text-stone-500 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
