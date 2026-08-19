import React from "react";

export function SizeChip({ label, selected, soldOut, onClick }) {
  return (
    <button
      type="button"
      title={soldOut ? `Size ${label} — out of stock` : undefined}
      aria-pressed={selected}
      disabled={soldOut}
      onClick={onClick}
      style={{
        minWidth: "3rem",
        padding: "0.5rem 0.75rem",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-base)",
        fontWeight: "var(--weight-medium)",
        border: `1px solid ${selected ? "#1c1917" : "var(--border)"}`,
        background: selected ? "#1c1917" : "transparent",
        color: soldOut ? "var(--muted)" : selected ? "#fff" : "var(--text)",
        textDecoration: soldOut ? "line-through" : "none",
        cursor: soldOut ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
