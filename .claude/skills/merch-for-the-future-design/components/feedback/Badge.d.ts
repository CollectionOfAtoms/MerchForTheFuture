export interface BadgeProps {
  /** auction (amber), forSale (emerald), sold (muted blue-slate), new (solid cerulean — count/attention pills). */
  tone?: "auction" | "forSale" | "sold" | "new";
  children: React.ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;
