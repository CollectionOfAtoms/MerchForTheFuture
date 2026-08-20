export interface IconButtonProps {
  direction?: "left" | "right";
  label?: string;
  onClick?: () => void;
}

export function IconButton(props: IconButtonProps): JSX.Element;
