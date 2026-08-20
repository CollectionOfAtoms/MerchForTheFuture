import React from "react";

export function Button({ variant = "primary", size = "md", children, disabled, onClick, type = "button", style }) {
  const sizes = { sm: { padding: "0.5rem 1rem", fontSize: "var(--text-xs)" }, md: { padding: "0.75rem 1.5rem", fontSize: "var(--text-base)" } };
  const base = {
    fontFamily: "var(--font-sans)",
    fontWeight: "var(--weight-medium)",
    borderRadius: "var(--radius-full)",
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    ...sizes[size],
  };
  const variants = {
    primary: disabled
      ? { background: "var(--border)", color: "var(--muted)" }
      : { background: "var(--color-cerulean)", color: "#fff" },
    secondary: disabled
      ? { background: "transparent", color: "var(--muted)", borderColor: "var(--border)" }
      : { background: "var(--surface)", color: "var(--color-blue-slate)", borderColor: "var(--color-tuscan-sun)" },
    dark: disabled
      ? { background: "var(--border)", color: "var(--muted)" }
      : { background: "#1c1917", color: "#fff" },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}
