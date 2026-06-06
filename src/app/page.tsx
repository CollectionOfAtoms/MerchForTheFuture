import { auth } from "@/auth";
import { redirect } from "next/navigation";

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
            Merch For The Future
          </p>
          <h1 className="max-w-2xl text-4xl sm:text-5xl font-semibold tracking-tight text-stone-900 leading-tight">
            We are living up to our name!
          </h1>
          <p className="max-w-xl text-lg text-stone-500 leading-relaxed">
            Sustainable clothing and original designs coming soon.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="bg-stone-50 border-b border-stone-200">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-6">Our mission</p>
          <p className="text-xl sm:text-2xl text-stone-700 leading-relaxed font-light">
            To create apparel that communicate our values toward our planet and its inhabitants with humor, exclusively human-made art, helpful information, and design choices that minimize harm for the planet in the creation of our products, with the express intent of building hopeful visions of our future.
          </p>
        </div>
      </section>

    </div>
  );
}
