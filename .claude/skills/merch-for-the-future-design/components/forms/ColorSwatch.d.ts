export interface ColorSwatchProps {
  name: string;
  hex: string;
  selected?: boolean;
  soldOut?: boolean;
  onClick?: () => void;
}

export function ColorSwatch(props: ColorSwatchProps): JSX.Element;
