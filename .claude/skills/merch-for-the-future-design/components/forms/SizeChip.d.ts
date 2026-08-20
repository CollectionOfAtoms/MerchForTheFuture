export interface SizeChipProps {
  label: string;
  selected?: boolean;
  soldOut?: boolean;
  onClick?: () => void;
}

export function SizeChip(props: SizeChipProps): JSX.Element;
