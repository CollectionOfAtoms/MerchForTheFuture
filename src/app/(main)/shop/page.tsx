import Link from "next/link";
import type { Metadata } from "next";
import { getApparelListings } from "@/lib/apparel/browse";
import ApparelListingCard from "@/components/ApparelListingCard";

const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: "Shop — Merch For The Future",
  description: "Browse optimism-forward, 100% organic cotton apparel made with human-made art.",
};

interface ShopPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);

  const { listings, total, totalPages } = await getApparelListings({ page, limit: PAGE_SIZE });

  function pageUrl(p: number): string {
    return p <= 1 ? "/shop" : `/shop?page=${p}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-cerulean">Shop</h1>
        <p className="mt-1 text-sm text-dark-cyan">
          {total > 0 ? `${total} design${total === 1 ? "" : "s"} available` : "No apparel found"}
        </p>
      </div>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-tuscan-sun/30 py-32 text-center">
          <p className="font-medium text-dark-cyan">Nothing here yet — check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((card) => (
            <ApparelListingCard key={card.id} card={card} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-12 flex items-center justify-center gap-4">
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="rounded-full border border-tuscan-sun/30 bg-white px-5 py-2 text-sm font-medium text-blue-slate transition-colors hover:border-dark-cyan"
            >
              ← Previous
            </Link>
          )}
          <span className="text-sm text-dark-cyan">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="rounded-full border border-tuscan-sun/30 bg-white px-5 py-2 text-sm font-medium text-blue-slate transition-colors hover:border-dark-cyan"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
