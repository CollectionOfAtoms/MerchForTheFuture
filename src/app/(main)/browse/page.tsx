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
  { value: "ending_soonest", label: "Ending Soonest" },
];

const PAGE_SIZE = 24;

interface BrowsePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const metadata = {
  title: "Browse — Merch For The Future",
  description: "Discover original artwork and fine art prints from independent artists.",
};

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q : undefined;
  const sort = (typeof params.sort === "string" ? params.sort : "newest") as SortOrder;
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const saleTypeParam = typeof params.type === "string" ? params.type : undefined;

  const saleType =
    saleTypeParam === "auction"
      ? ("AUCTION" as const)
      : saleTypeParam === "fixed"
        ? ("FIXED_PRICE" as const)
        : undefined;

  const availability =
    saleTypeParam === "print" ? ("print" as const) : undefined;

  const { artworks, total, totalPages } = await browseArtworks({
    q,
    sort,
    page,
    limit: PAGE_SIZE,
    filters: saleType || availability ? { saleType, availability } : undefined,
  });

  const session = await auth();
  const display = await getDisplayCurrency((session?.user as { id?: string } | undefined)?.id);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const merged: Record<string, string> = {};
    if (q) merged.q = q;
    if (sort && sort !== "newest") merged.sort = sort;
    if (page > 1) merged.page = String(page);
    if (saleTypeParam) merged.type = saleTypeParam;
    Object.entries(overrides).forEach(([k, v]) => {
      if (v == null || v === "") delete merged[k];
      else merged[k] = v;
    });
    const qs = new URLSearchParams(merged).toString();
    return `/browse${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header & search */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-cerulean">Browse Artwork</h1>
          <p className="mt-1 text-sm text-dark-cyan">
            {total > 0 ? `${total} piece${total === 1 ? "" : "s"} available` : "No artwork found"}
          </p>
        </div>

        <form method="get" action="/browse" className="flex w-full items-center gap-2 sm:w-auto">
          {saleTypeParam && <input type="hidden" name="type" value={saleTypeParam} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search artwork, artist…"
            className="h-9 min-w-0 flex-1 rounded-full border border-tuscan-sun/40 bg-white px-4 text-sm text-blue-slate placeholder-blue-slate/40 focus:outline-none focus:ring-2 focus:ring-cerulean sm:w-56 sm:flex-none"
          />
          <button
            type="submit"
            className="h-9 shrink-0 rounded-full bg-cerulean px-4 text-sm font-medium text-white hover:bg-dark-cyan transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Filters & sort */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Sale type filter */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: undefined, label: "All" },
            { value: "auction", label: "Auctions" },
            { value: "fixed", label: "Fixed Price" },
            { value: "print", label: "Prints" },
          ].map(({ value, label }) => (
            <Link
              key={label}
              href={buildUrl({ type: value, page: undefined })}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-center text-xs font-medium transition-colors ${
                saleTypeParam === value
                  ? "border-cerulean bg-cerulean text-white"
                  : "border-tuscan-sun/30 bg-white text-blue-slate hover:border-dark-cyan"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Sort */}
        <div className="ml-auto">
          <select
            name="sort"
            defaultValue={sort}
            onChange={undefined}
            className="rounded-full border border-tuscan-sun/30 bg-white px-3 py-1 text-xs text-blue-slate focus:outline-none"
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
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-tuscan-sun/30 py-32 text-center">
          <p className="text-dark-cyan font-medium">No artwork found</p>
          {q && (
            <Link
              href="/browse"
              className="mt-3 text-sm text-blue-slate/50 underline hover:text-blue-slate"
            >
              Clear search
            </Link>
          )}
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
              className="rounded-full border border-tuscan-sun/30 bg-white px-5 py-2 text-sm font-medium text-blue-slate hover:border-dark-cyan transition-colors"
            >
              ← Previous
            </Link>
          )}
          <span className="text-sm text-dark-cyan">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="rounded-full border border-tuscan-sun/30 bg-white px-5 py-2 text-sm font-medium text-blue-slate hover:border-dark-cyan transition-colors"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
