function NavBar({ screen, setScreen, cartCount, dark, setDark }) {
  const links = [
    { id: "discover", label: "Discover" },
    { id: "shop", label: "Shop" },
    { id: "browse", label: "Browse" },
  ];
  const linkColor = dark ? "var(--color-cream)" : "var(--color-blue-slate)";
  const activeColor = dark ? "#fff" : "var(--color-cerulean)";
  return (
    <header style={{ background: dark ? "var(--color-bar-dark)" : "var(--color-tuscan-sun)", borderBottom: dark ? "3px solid var(--color-tuscan-sun)" : "1px solid rgba(249,199,79,0.4)" }}>
      <div style={{ maxWidth: "var(--content-max)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
        <span onClick={() => setScreen("home")} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
          <img src="../../assets/logo-mark.jpg" style={{ height: "32px", width: "32px", borderRadius: "8px", objectFit: "cover" }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", color: dark ? "var(--color-cream)" : "var(--color-cerulean)" }}>Merch for the Future</span>
        </span>
        <nav style={{ display: "flex", gap: "32px", fontSize: "var(--text-base)", color: linkColor }}>
          {links.map((l) => (
            <span key={l.id} onClick={() => setScreen(l.id)} style={{ cursor: "pointer", fontWeight: screen === l.id ? "var(--weight-semibold)" : "var(--weight-regular)", color: screen === l.id ? activeColor : linkColor }}>{l.label}</span>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button onClick={() => setDark((v) => !v)} aria-label="Toggle dark mode" style={{ border: "none", background: "transparent", cursor: "pointer", color: linkColor, display: "flex" }}>
            {dark ? (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
          <span style={{ position: "relative", color: linkColor }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            {cartCount > 0 && <span style={{ position: "absolute", top: -6, right: -8, background: "var(--color-cerulean)", color: "#fff", borderRadius: "999px", fontSize: "10px", minWidth: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}
          </span>
          <span style={{ borderRadius: "999px", background: "var(--color-cerulean)", color: "#fff", padding: "8px 16px", fontSize: "var(--text-sm)", cursor: "pointer" }}>Sign up</span>
        </div>
      </div>
    </header>
  );
}
window.NavBar = NavBar;
