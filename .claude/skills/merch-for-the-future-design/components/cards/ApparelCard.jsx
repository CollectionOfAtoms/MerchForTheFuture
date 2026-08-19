import React from "react";

export function ApparelCard({ image, title, price, secondaryPrice, colorCount }) {
  return (
    <a
      href="#"
      style={{ display: "block", textDecoration: "none", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "rgba(249,199,79,0.1)" }}
    >
      <div style={{ aspectRatio: "1/1", width: "100%", overflow: "hidden", background: "#f5f5f4" }}>
        {image ? (
          <img src={image} alt={title} style={{ height: "100%", width: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", height: "100%", width: "100%", alignItems: "center", justifyContent: "center", color: "var(--color-dark-cyan)", fontSize: "var(--text-sm)" }}>No image</div>
        )}
      </div>
      <div style={{ padding: "1rem", fontFamily: "var(--font-sans)" }}>
        <p style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", color: "var(--color-blue-slate)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
        <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <span style={{ fontSize: "var(--text-base)", fontWeight: "var(--weight-bold)", color: "var(--color-cerulean)" }}>
            {price}
            {secondaryPrice && <span style={{ marginLeft: "0.25rem", fontSize: "var(--text-xs)", fontWeight: "var(--weight-regular)", color: "var(--color-dark-cyan)" }}>({secondaryPrice})</span>}
          </span>
          {colorCount != null && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-dark-cyan)" }}>Available in {colorCount} {colorCount === 1 ? "color" : "colors"}</span>}
        </div>
      </div>
    </a>
  );
}
