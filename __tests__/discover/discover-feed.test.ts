import { describe, it, expect } from "vitest";
import { toDiscoverTiles, shuffle } from "@/lib/discover/feed";
import type { ApparelCard } from "@/lib/apparel/browse";
import type { ArtworkCard } from "@/lib/artworks/browse";

function apparel(over: Partial<ApparelCard> = {}): ApparelCard {
  return { id: "a1", title: "Tee", description: "A soft organic tee.", primaryImageUrl: "https://x/a.jpg", retailPrice: 28, colorCount: 2, ...over };
}
function art(over: Partial<ArtworkCard>): ArtworkCard {
  return {
    id: "art1", title: "Sunrise", description: "Oil on canvas.", medium: null, year: null, sellerId: "s1", artist: null,
    primaryImageUrl: "https://x/art.jpg", hasOriginal: true, hasPrint: false,
    originalStatus: "ACTIVE", saleType: "FIXED_PRICE", price: 500, currency: "USD", publishedAt: new Date(),
    ...over,
  };
}

describe("toDiscoverTiles", () => {
  it("maps an apparel card to a /shop tile with a USD price and description excerpt", () => {
    const [tile] = toDiscoverTiles([apparel()], []);
    expect(tile).toMatchObject({ kind: "apparel", href: "/shop/a1", badge: "Apparel", price: 28 });
    expect(tile.priceLabel).toBe("$28");
    expect(tile.description).toBe("A soft organic tee.");
  });

  it("carries the listing's media as the navigable image set, preserving backgrounds", () => {
    const media = [
      { url: "https://x/life.jpg", backgroundColor: null },
      { url: "https://x/mock.jpg", backgroundColor: "#000000" },
    ];
    const [tile] = toDiscoverTiles([apparel({ media })], []);
    expect(tile.images).toEqual(media);
  });

  it("falls back to a single-image set from the primary image when media is absent", () => {
    const [tile] = toDiscoverTiles([apparel({ media: undefined, primaryImageUrl: "https://x/only.jpg" })], []);
    expect(tile.images).toEqual([{ url: "https://x/only.jpg", backgroundColor: null }]);
  });

  it("collapses whitespace and truncates a long description to an excerpt", () => {
    const long = "Line one.\n\nLine two with   extra spaces. " + "x".repeat(300);
    const [tile] = toDiscoverTiles([apparel({ description: long })], []);
    expect(tile.description!.length).toBeLessThanOrEqual(201); // 200 + ellipsis
    expect(tile.description).toMatch(/^Line one\. Line two/);
    expect(tile.description!.endsWith("…")).toBe(true);
  });

  it("uses a null excerpt when there's no description", () => {
    const [tile] = toDiscoverTiles([apparel({ description: null })], []);
    expect(tile.description).toBeNull();
  });

  it("maps a fixed-price original to an /artwork tile", () => {
    const [tile] = toDiscoverTiles([], [art({ id: "fp", saleType: "FIXED_PRICE", price: 500 })]);
    expect(tile).toMatchObject({ kind: "art", href: "/artwork/fp", badge: "Original", price: 500 });
    expect(tile.priceLabel).toBe("$500");
  });

  it("labels an active auction as bidding (no sticker price)", () => {
    const [tile] = toDiscoverTiles([], [art({ id: "au", saleType: "AUCTION", price: 120 })]);
    expect(tile.badge).toBe("Auction");
    expect(tile.price).toBeNull();
    expect(tile.priceLabel).toMatch(/bidding from \$120/i);
  });

  it("includes a print-only artwork (no active original) as a Print tile", () => {
    const [tile] = toDiscoverTiles([], [art({ id: "pr", hasOriginal: true, originalStatus: "SOLD", hasPrint: true })]);
    expect(tile.badge).toBe("Print");
    expect(tile.priceLabel).toMatch(/prints available/i);
  });

  it("excludes sold originals that have no prints", () => {
    const tiles = toDiscoverTiles([], [art({ id: "sold", originalStatus: "SOLD", hasPrint: false })]);
    expect(tiles).toHaveLength(0);
  });

  it("merges apparel and art into one list", () => {
    const tiles = toDiscoverTiles([apparel({ id: "a1" })], [art({ id: "art1" })]);
    expect(tiles.map((t) => t.kind).sort()).toEqual(["apparel", "art"]);
  });
});

describe("shuffle", () => {
  it("returns a permutation without mutating the input", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    const out = shuffle(input, mulberry32(42));
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual(copy); // not mutated
  });

  it("is deterministic for a given rng sequence", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(7));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(7));
    expect(a).toEqual(b);
  });
});

/** Tiny seeded PRNG for deterministic shuffle tests. */
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
