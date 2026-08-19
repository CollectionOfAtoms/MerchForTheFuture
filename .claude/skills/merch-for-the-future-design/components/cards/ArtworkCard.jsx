import React, { useState } from "react";

const badgeTones = { Sold: { background: "rgba(87,117,144,0.2)", color: "#577590" }, Auction: { background: "#fde68a", color: "#78350f" }, "For sale": { background: "#a7f3d0", color: "#064e3b" } };

export function ArtworkCard({ image, title, artist, price, badge }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href="#"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative", display: "block", marginBottom: "1rem", overflow: "hidden", borderRadius: "var(--radius-lg)", background: "rgba(249,199,79,0.1)", textDecoration: "none" }}
    >
      {image ? (
        <img src={image} alt={title} style={{ width: "100%", display: "block", objectFit: "cover", transform: hover ? "scale(1.05)" : "scale(1)", transition: "transform 0.5s ease" }} />
      ) : (
        <div style={{ display: "flex", height: "12rem", width: "100%", alignItems: "center", justifyContent: "center", color: "var(--color-dark-cyan)", fontSize: "var(--text-sm)" }}>No image</div>
      )}
      <div style={{ position: "absolute", insetInline: 0, bottom: 0, background: "rgba(39,125,161,0.9)", padding: "1rem", transform: hover ? "translateY(0)" : "translateY(100%)", transition: "transform 0.3s ease" }}>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
        {artist && <p style={{ margin: "0.125rem 0 0", fontSize: "var(--text-xs)", color: "rgba(249,199,79,0.8)" }}>{artist}</p>}
        <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          {price && <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", color: "#fff" }}>{price}</span>}
          {badge && <span style={{ borderRadius: "var(--radius-full)", padding: "0.125rem 0.5rem", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", ...(badgeTones[badge] ?? {}) }}>{badge}</span>}
        </div>
      </div>
    </a>
  );
}
