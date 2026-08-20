function FooterBar({ dark }) {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", background: "var(--surface)", marginTop: "auto" }}>
      <div style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "40px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--muted)" }}>
        <span>© 2026 Merch for the Future. All rights reserved.</span>
        <nav style={{ display: "flex", gap: "24px" }}>
          <span style={{ cursor: "pointer" }}>Browse</span>
          <span style={{ cursor: "pointer" }}>Sign in</span>
        </nav>
      </div>
    </footer>
  );
}
window.FooterBar = FooterBar;
