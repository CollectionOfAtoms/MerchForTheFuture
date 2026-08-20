import React from "react";

const tones = {
  auction: { background: "#fde68a", color: "#78350f" },
  forSale: { background: "#a7f3d0", color: "#064e3b" },
  sold: { background: "rgba(87,117,144,0.2)", color: "var(--color-blue-slate)" },
  new: { background: "var(--color-cerulean)", color: "#fff" },
};

export function Badge({ tone = "new", children }) {
  const t = tones[tone] ?? tones.new;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "var(--radius-full)",
        padding: "0.125rem 0.625rem",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-medium)",
        fontFamily: "var(--font-sans)",
        ...t,
      }}
    >
      {children}
    </span>
  );
}
