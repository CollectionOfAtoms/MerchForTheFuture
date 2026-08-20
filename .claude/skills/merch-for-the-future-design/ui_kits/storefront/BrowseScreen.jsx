const ARTWORKS = [
  { id: 1, title: "Coral Bloom", artist: "J. Caldwell", price: "$450", badge: "For sale", hue: "#43aa8b", h: 260 },
  { id: 2, title: "Terraced Futures", artist: "E. Sparks", price: "Bid from $120", badge: "Auction", hue: "#f9c74f", h: 320 },
  { id: 3, title: "Root & Circuit", artist: "J. Caldwell", price: "$300", badge: "Sold", hue: "#577590", h: 220 },
  { id: 4, title: "Greenhouse Glow", artist: "E. Sparks", price: "$275", badge: "For sale", hue: "#f3722c", h: 300 },
];

function BrowseScreen() {
  const [hover, setHover] = React.useState(null);
  const tones = { "For sale": { background: "#a7f3d0", color: "#064e3b" }, Auction: { background: "#fde68a", color: "#78350f" }, Sold: { background: "rgba(87,117,144,0.2)", color: "#577590" } };
  return (
    <div style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ margin: "0 0 24px", fontSize: "var(--text-title)", fontWeight: "var(--weight-semibold)", color: "var(--color-cerulean)" }}>Browse</h1>
      <div style={{ columnCount: 2, columnGap: "16px" }}>
        {ARTWORKS.map((a) => (
          <div key={a.id} onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)} style={{ breakInside: "avoid", marginBottom: "16px", position: "relative", borderRadius: "var(--radius-lg)", overflow: "hidden", background: a.hue, height: a.h, border: "1px solid var(--border)" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(39,125,161,0.9)", padding: "16px", transform: hover === a.id ? "translateY(0)" : "translateY(100%)", transition: "transform 0.3s ease", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "#fff" }}>{a.title}</p>
              <p style={{ margin: "2px 0 8px", fontSize: "var(--text-xs)", color: "rgba(249,199,79,0.8)" }}>{a.artist}</p>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", color: "#fff" }}>{a.price}</span>
                <span style={{ borderRadius: "999px", padding: "2px 8px", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", ...tones[a.badge] }}>{a.badge}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.BrowseScreen = BrowseScreen;
