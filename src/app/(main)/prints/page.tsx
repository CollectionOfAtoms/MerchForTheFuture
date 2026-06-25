import Link from "next/link";
import { browseArtworks } from "@/lib/artworks/browse";
import ListingCard from "@/components/ListingCard";
import type { SortOrder } from "@/lib/artworks/browse";
import { auth } from "@/auth";
import { getDisplayCurrency } from "@/lib/tax/buyer-currency";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

const PAGE_SIZE = 24;

interface PrintsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const metadata = {
  title: "Fine Art Prints — Merch For The Future",
  description: "Order high-quality fine art prints from independent artists. Museum-quality printing on demand.",
};

export default async function PrintsPage({ searchParams }: PrintsPageProps) {
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q : undefined;
  const sort = (typeof params.sort === "string" ? params.sort : "newest") as SortOrder;
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);

  const { artworks, total, totalPages } = await browseArtworks({
    q,
    sort,
    page,
    limit: PAGE_SIZE,
    filters: { availability: "print" },
  });

  const session = await auth();
  const display = await getDisplayCurrency((session?.user as { id?: string } | undefined)?.id);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const merged: Record<string, string> = {};
    if (q) merged.q = q;
    if (sort && sort !== "newest") merged.sort = sort;
    if (page > 1) merged.page = String(page);
    Object.entries(overrides).forEach(([k, v]) => {
      if (v == null || v === "") delete merged[k];
      else merged[k] = v;
    });
    const qs = new URLSearchParams(merged).toString();
    return `/prints${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Fine Art Prints</h1>
          <p className="mt-1 text-sm text-stone-500">
            {total > 0
              ? `${total} print${total === 1 ? "" : "s"} available — museum-quality on demand`
              : "No prints available yet"}
          </p>
        </div>

        <form method="get" action="/prints" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search artwork, artist…"
            className="h-9 rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
          <button
            type="submit"
            className="h-9 rounded-full bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Sort */}
      <div className="mb-6 flex items-center justify-between">
        <Link href="/browse" className="text-sm text-stone-500 hover:text-stone-700 transition-colors">
          ← All artwork
        </Link>
        <div>
          <select
            name="sort"
            defaultValue={sort}
            className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 focus:outline-none"
            aria-label="Sort order"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Gallery grid */}
      {artworks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-200 py-32 text-center">
          <p className="text-stone-500 font-medium">No prints available yet</p>
          <Link
            href="/browse"
            className="mt-3 text-sm text-stone-400 underline hover:text-stone-600"
          >
            Browse all artwork
          </Link>
        </div>
      ) : (
        <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
          {artworks.map((card) => (
            <ListingCard key={card.id} card={card} display={display} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-12 flex items-center justify-center gap-4">
          {page > 1 && (
            <Link
              href={buildUrl({ page: page === 2 ? undefined : String(page - 1) })}
              className="rounded-full border border-stone-200 bg-white px-5 py-2 text-sm font-medium text-stone-700 hover:border-stone-400 transition-colors"
            >
              ← Previous
            </Link>
          )}
          <span className="text-sm text-stone-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="rounded-full border border-stone-200 bg-white px-5 py-2 text-sm font-medium text-stone-700 hover:border-stone-400 transition-colors"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
