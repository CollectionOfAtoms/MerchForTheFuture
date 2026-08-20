import React from "react";

export function Input({ label, placeholder, type = "text", value, onChange, error }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem", fontFamily: "var(--font-sans)" }}>
      {label && <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--color-blue-slate)" }}>{label}</span>}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-base)",
          padding: "0.625rem 0.875rem",
          borderRadius: "var(--radius-sm)",
          border: `1px solid ${error ? "var(--color-strawberry-red)" : "var(--border)"}`,
          background: "var(--surface)",
          color: "var(--text)",
          outline: "none",
        }}
      />
      {error && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-strawberry-red)" }}>{error}</span>}
    </label>
  );
}
