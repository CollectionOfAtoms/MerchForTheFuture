export interface ButtonProps {
  /** Visual treatment: primary (cerulean fill — main CTAs like "Add to cart"), secondary (outlined, tuscan-sun border — "Sign up"/pagination), dark (near-black fill — checkout/destructive-adjacent actions). */
  variant?: "primary" | "secondary" | "dark";
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Button(props: ButtonProps): JSX.Element;
