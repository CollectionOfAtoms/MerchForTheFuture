import type { Metadata } from "next";
import { getDiscoverFeed } from "@/lib/discover/feed";
import DiscoverBento from "@/components/discover/DiscoverBento";

// Reshuffle the feed on every request (no caching) so the bento order is fresh
// on each page load.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover — Merch For The Future",
  description: "Apparel and original art, freshly shuffled.",
};

export default async function DiscoverPage() {
  const tiles = await getDiscoverFeed();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text">Discover</h1>
        <p className="mt-1 text-sm text-muted">Apparel and original art, freshly shuffled.</p>
      </div>
      <DiscoverBento tiles={tiles} />
    </main>
  );
}
