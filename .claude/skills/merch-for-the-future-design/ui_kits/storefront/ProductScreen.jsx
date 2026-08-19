const COLORS = [
  { name: "Willow", hex: "#90be6d" },
  { name: "Cerulean", hex: "#277da1" },
  { name: "Tangerine", hex: "#f3722c" },
  { name: "Sold out", hex: "#a8a29e", soldOut: true },
];
const SIZES = ["S", "M", "L", "XL"];

function ProductScreen({ product, setScreen }) {
  const [color, setColor] = React.useState(0);
  const [size, setSize] = React.useState(null);
  const [added, setAdded] = React.useState(false);
  if (!product) return null;
  return (
    <div style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "40px 24px" }}>
      <span onClick={() => setScreen("shop")} style={{ fontSize: "var(--text-sm)", color: "var(--muted)", cursor: "pointer" }}>← Back to shop</span>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", alignItems: "start" }}>
        {/* Left column — photo carousel */}
        <div style={{ aspectRatio: "5/4", borderRadius: "var(--radius-lg)", background: product.hue, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.6)", fontSize: "var(--text-sm)" }}>Product photo</div>

        {/* Right column — title, price, description, options */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "var(--text-title)", fontWeight: "var(--weight-semibold)", color: "var(--text)" }}>{product.title}</h1>
            <p style={{ margin: "6px 0 0", fontSize: "var(--text-title)", fontWeight: "var(--weight-bold)", color: "var(--color-cerulean)" }}>{product.price}</p>
          </div>

          <p style={{ margin: 0, fontSize: "var(--text-sm)", lineHeight: "var(--leading-relaxed)", color: "var(--muted)" }}>Screen-printed on 100% GOTS-certified organic cotton. Ethically produced, biodegradable, and made to be worn for years — not seasons.</p>

          <div>
            <p style={{ marginBottom: "8px", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--text)" }}>Color</p>
            <div style={{ display: "flex", gap: "8px" }}>
              {COLORS.map((c, i) => (
                <button key={c.name} disabled={c.soldOut} onClick={() => setColor(i)} title={c.name} style={{ height: "36px", width: "36px", borderRadius: "999px", background: c.hex, border: `2px solid ${color === i ? "var(--text)" : "var(--border)"}`, opacity: c.soldOut ? 0.4 : 1, filter: c.soldOut ? "grayscale(1)" : "none", cursor: c.soldOut ? "not-allowed" : "pointer" }} />
              ))}
            </div>
          </div>

          <div>
            <p style={{ marginBottom: "8px", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--text)" }}>Size</p>
            <div style={{ display: "flex", gap: "8px" }}>
              {SIZES.map((s) => (
                <button key={s} onClick={() => setSize(s)} style={{ minWidth: "3rem", padding: "8px 12px", borderRadius: "var(--radius-sm)", fontSize: "var(--text-base)", fontWeight: "var(--weight-medium)", border: `1px solid ${size === s ? "var(--text)" : "var(--border)"}`, background: size === s ? "var(--text)" : "transparent", color: size === s ? "var(--bg)" : "var(--text)", cursor: "pointer" }}>{s}</button>
              ))}
            </div>
          </div>

          <div>
            <button onClick={() => setAdded(true)} disabled={!size} style={{ display: "block", width: "100%", borderRadius: "999px", padding: "12px 32px", fontSize: "var(--text-base)", fontWeight: "var(--weight-medium)", border: "none", background: size ? "var(--text)" : "var(--border)", color: size ? "var(--bg)" : "var(--muted)", cursor: size ? "pointer" : "not-allowed" }}>Add to cart</button>
            {!size && <p style={{ marginTop: "8px", textAlign: "center", fontSize: "var(--text-xs)", color: "var(--muted)" }}>Select a size to continue</p>}
            {added && <p style={{ marginTop: "8px", textAlign: "center", fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: "var(--color-seagrass)" }}>Added to cart</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
window.ProductScreen = ProductScreen;
