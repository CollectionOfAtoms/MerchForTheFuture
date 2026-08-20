export interface ArtworkCardProps {
  image?: string;
  title: string;
  artist?: string;
  price?: string;
  badge?: "Sold" | "Auction" | "For sale";
}

export function ArtworkCard(props: ArtworkCardProps): JSX.Element;
