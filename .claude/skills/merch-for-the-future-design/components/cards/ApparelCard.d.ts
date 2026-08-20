export interface ApparelCardProps {
  image?: string;
  title: string;
  price: string;
  secondaryPrice?: string;
  colorCount?: number;
}

export function ApparelCard(props: ApparelCardProps): JSX.Element;
