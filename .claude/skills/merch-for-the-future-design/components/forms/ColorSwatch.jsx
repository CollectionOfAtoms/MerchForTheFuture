import React from "react";

export function ColorSwatch({ name, hex, selected, soldOut, onClick }) {
  return (
    <button
      type="button"
      title={soldOut ? `${name} — out of stock` : name}
      aria-label={name}
      aria-pressed={selected}
      disabled={soldOut}
      onClick={onClick}
      style={{
        height: "2.25rem",
        width: "2.25rem",
        borderRadius: "var(--radius-full)",
        overflow: "hidden",
        border: `2px solid ${selected ? "#1c1917" : "var(--border)"}`,
        boxShadow: selected ? "0 0 0 2px rgba(28,25,23,0.3)" : "none",
        cursor: soldOut ? "not-allowed" : "pointer",
        opacity: soldOut ? 0.4 : 1,
        filter: soldOut ? "grayscale(1)" : "none",
        padding: 0,
        background: hex,
        transition: "transform 0.15s ease",
      }}
    />
  );
}
