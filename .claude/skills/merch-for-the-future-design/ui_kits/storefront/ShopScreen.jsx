const APPAREL = [
  { id: 1, title: "Solar Punk Bee Tee", price: "$32.00", colorCount: 3, hue: "#90be6d" },
  { id: 2, title: "Hopeful Harvest Hoodie", price: "$58.00", colorCount: 2, hue: "#f9c74f" },
  { id: 3, title: "Root Systems Tote", price: "$24.00", colorCount: 4, hue: "#43aa8b" },
  { id: 4, title: "Greenhouse Grid Tee", price: "$32.00", colorCount: 1, hue: "#277da1" },
  { id: 5, title: "Wildflower Windbreaker", price: "$64.00", colorCount: 2, hue: "#f3722c" },
  { id: 6, title: "Compost Cycle Cap", price: "$22.00", colorCount: 3, hue: "#577590" },
];

function ShopScreen({ setScreen, setProduct }) {
  return (
    <div style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ margin: 0, fontSize: "var(--text-title)", fontWeight: "var(--weight-semibold)", color: "var(--color-cerulean)" }}>Shop</h1>
        <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--muted)" }}>{APPAREL.length} designs available</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
        {APPAREL.map((p) => (
          <div key={p.id} onClick={() => { setProduct(p); setScreen("product"); }} style={{ cursor: "pointer", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div style={{ aspectRatio: "1/1", background: p.hue, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.6)", fontSize: "var(--text-xs)" }}>Product photo</div>
            <div style={{ padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", color: "var(--text)" }}>{p.title}</p>
              <div style={{ marginTop: "4px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "var(--text-base)", fontWeight: "var(--weight-bold)", color: "var(--color-cerulean)" }}>{p.price}</span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>Available in {p.colorCount} {p.colorCount === 1 ? "color" : "colors"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.ShopScreen = ShopScreen;
window.APPAREL = APPAREL;
