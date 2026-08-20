import React from "react";

export function IconButton({ direction = "right", onClick, label }) {
  return (
    <button
      type="button"
      aria-label={label ?? (direction === "left" ? "Previous" : "Next")}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: "2.25rem",
        width: "2.25rem",
        borderRadius: "var(--radius-full)",
        border: "none",
        background: "rgba(0,0,0,0.45)",
        color: "#fff",
        cursor: "pointer",
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))" }} aria-hidden="true">
        {direction === "left" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}
