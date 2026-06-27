import { getApparelListings, type ApparelCard } from "@/lib/apparel/browse";
import { browseArtworks, type ArtworkCard } from "@/lib/artworks/browse";

/**
 * A normalized tile for the Discover bento homepage — apparel and art reduced to
 * one uniform shape so the grid never branches on kind. The normalize + shuffle
 * steps are pure (below) and unit-tested; getDiscoverFeed wires them to the data.
 */
export interface DiscoverTile {
  kind: "apparel" | "art";
  id: string;
  title: string;
  href: string;
  imageUrl: string | null;
  /** USD amount when there's a single sticker price, else null (auctions/prints). */
  price: number | null;
  priceLabel: string;
  badge: string;
}

function formatPrice(amount: number, currency = "USD"): string {
  return amount.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
}

/** An artwork is buyable when its original is on sale, or prints are available. */
function isBuyableArt(card: ArtworkCard): boolean {
  return (card.hasOriginal && card.originalStatus === "ACTIVE") || card.hasPrint;
}

function apparelTile(card: ApparelCard): DiscoverTile {
  return {
    kind: "apparel",
    id: card.id,
    title: card.title,
    href: `/shop/${card.id}`,
    imageUrl: card.primaryImageUrl,
    price: card.retailPrice,
    priceLabel: formatPrice(card.retailPrice),
    badge: "Apparel",
  };
}

function artTile(card: ArtworkCard): DiscoverTile {
  const currency = card.currency ?? "USD";
  let priceLabel: string;
  let badge: string;
  let price: number | null = null;

  if (card.hasOriginal && card.originalStatus === "ACTIVE" && card.saleType === "AUCTION") {
    badge = "Auction";
    priceLabel = card.price != null ? `Bidding from ${formatPrice(card.price, currency)}` : "Auction";
  } else if (card.hasOriginal && card.originalStatus === "ACTIVE") {
    badge = "Original";
    price = card.price;
    priceLabel = card.price != null ? formatPrice(card.price, currency) : "Original";
  } else {
    badge = "Print";
    priceLabel = "Prints available";
  }

  return {
    kind: "art",
    id: card.id,
    title: card.title,
    href: `/artwork/${card.id}`,
    imageUrl: card.primaryImageUrl,
    price,
    priceLabel,
    badge,
  };
}

/**
 * Merge apparel + art into one normalized tile list (pure). Apparel cards are all
 * ACTIVE already; art is filtered to buyable pieces. Order is preserved — callers
 * shuffle for the homepage.
 */
export function toDiscoverTiles(apparel: ApparelCard[], artworks: ArtworkCard[]): DiscoverTile[] {
  return [
    ...apparel.map(apparelTile),
    ...artworks.filter(isBuyableArt).map(artTile),
  ];
}

/** Fisher–Yates shuffle (pure, non-mutating). rng defaults to Math.random. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The Discover feed: active apparel + buyable art, normalized and shuffled fresh.
 * The page is force-dynamic, so the order changes on every load.
 */
export async function getDiscoverFeed(): Promise<DiscoverTile[]> {
  const [apparel, art] = await Promise.all([
    getApparelListings({ limit: 24 }),
    browseArtworks({ limit: 100, sort: "newest" }),
  ]);
  return shuffle(toDiscoverTiles(apparel.listings, art.artworks));
}
